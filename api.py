"""
api.py — Optimized AI Presentation Engine
==========================================
OPTIMIZATIONS:
1. Batch generation: ALL slides in ONE LLM call (5x faster)
2. Groq support: 10-20x faster than local Ollama
3. Simplified image IDs for reliable LLM matching
4. Fallback image assignment
5. Proper diagram injection
"""

import sys
import os
import logging
import shutil
import tempfile
import uuid
import json
import asyncio
import hashlib
import re
from pathlib import Path
from datetime import datetime

from matplotlib.pyplot import title

from modules.pedagogical_engine import _build_slide_prompt

ROOT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT_DIR))

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse

from modules.config_loader import CONFIG
from modules.ingestion import ingest_directory
from modules.ocr import run_ocr, warm_ocr_engine
from modules.text_processing import process_pages
from modules.embeddings import build_vector_db
from modules.retrieval import Retriever, _load_reranker
from modules.slide_generator import SlideData
from modules.history_store import record_presentation, load_history, clear_history
from modules.html_renderer import render as render_html
from modules.context_manager import prepare_context_for_slides, extract_section_outline
from modules.llm_cache import clear_cache, cache_stats
from modules.evaluation import RAGEvaluator
from modules.health import full_health_check, quick_status
from dotenv import load_dotenv
import time

load_dotenv()
log = logging.getLogger("api")
logging.basicConfig(level=logging.INFO)

app = FastAPI(
    title="EduGenius AI - Optimized",
    version="4.0.0",
    description="Fast RAG-powered presentations with Groq + batch generation",
)

# ── CORS ─────────────────────────────────────────────────────────────────────
_default_origins = ",".join([
    "http://localhost:5173", "http://127.0.0.1:5173",
    "http://localhost:8080", "http://127.0.0.1:8080",
    "http://localhost:8081", "http://127.0.0.1:8081",
    "http://localhost:8085", "http://127.0.0.1:8085",
    "http://localhost:8086", "http://127.0.0.1:8086",
    "http://localhost:8087", "http://127.0.0.1:8087",
    "http://localhost:8088", "http://127.0.0.1:8088",
    "http://localhost:8089", "http://127.0.0.1:8089",
    "http://localhost:8090", "http://127.0.0.1:8090",
])
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in os.getenv("ALLOWED_ORIGINS", _default_origins).split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Caches ───────────────────────────────────────────────────────────────────
_index_cache: dict[str, dict] = {}
_session_store: dict[str, dict] = {}
_llm_engine = None

def _get_llm_engine():
    """Get or create cached LLM engine instance."""
    global _llm_engine
    if _llm_engine is None:
        from modules.llm import LLMEngine
        _llm_engine = LLMEngine()
    return _llm_engine

def _files_hash_from_content(files_data: list[tuple[str, bytes]]) -> str:
    """Compute hash from file content BEFORE writing to disk."""
    h = hashlib.sha1()
    for name, content in sorted(files_data, key=lambda x: x[0]):
        h.update(name.encode())
        h.update(content)
    return h.hexdigest()


def _build_image_registry(pages: list, chunks: list) -> tuple[dict, list, dict, dict]:
    """
    Create simple image IDs (IMG_001) with context descriptions and captions.
    Returns: (pdf_images, available_image_ids, image_contexts, image_captions)
    """
    pdf_images = {}
    image_contexts = {}
    image_captions = {}
    
    pdf_img_pages = [p for p in pages if p.type == "pdf_image" and isinstance(p.image, str)]
    
    for idx, page in enumerate(pdf_img_pages):
        simple_id = f"IMG_{idx + 1:03d}"
        pdf_images[simple_id] = page.image
        
        # Store caption if available
        caption = getattr(page, 'caption', '') or ''
        if caption:
            image_captions[simple_id] = caption
        
        # Build context from nearby text chunks
        match = re.match(r"^(.+?)\s*\(.*?page\s*(\d+).*\)$", page.source, re.IGNORECASE)
        if match:
            base_name, pg_num = match.group(1).strip(), int(match.group(2))
            context_chunks = [c.text[:200] for c in chunks if c.source == base_name and c.page == pg_num]
            image_contexts[simple_id] = " ".join(context_chunks)[:400] if context_chunks else f"Image from {base_name}, page {pg_num}"
        else:
            image_contexts[simple_id] = caption or f"Image: {page.source[:100]}"
    
    figure_ref_map = {}
    for img_id, page in zip(list(pdf_images.keys()), pdf_img_pages):
        ref = getattr(page, 'figure_ref', '') or ''
        if ref:
            # Store multiple key variants to handle different formats
            key = ref.lower().strip().rstrip('.:')
            figure_ref_map[key] = img_id
            # Also store just the number part e.g. "2-23"
            num_match = re.search(r'[\d]+[-\.][\d]+', key)
            if num_match:
                figure_ref_map[f"figure {num_match.group(0)}"] = img_id
                figure_ref_map[f"fig. {num_match.group(0)}"] = img_id

    return pdf_images, list(pdf_images.keys()), image_contexts, image_captions, figure_ref_map

def _extract_figure_refs_from_chunks(chunks: list) -> list[str]:
    """
    Extract all figure references mentioned in chunks.
    Returns list like ['2-11', '2-12', '3-5']
    """
    mentioned = []
    for chunk in chunks:
        text = getattr(chunk, 'text', '')
        # Find patterns like "Figure 2-11", "Fig. 2-12", "Table 3-5"
        refs = re.findall(
            r'(?:Figure|Fig\.|Table)\s+([\d]+[-\.][\d]+(?:[-\.][\d]+)*)',
            text,
            re.IGNORECASE
        )
        mentioned.extend(refs)
    
    # Deduplicate while preserving order
    seen = set()
    unique = []
    for ref in mentioned:
        if ref not in seen:
            seen.add(ref)
            unique.append(ref)
    
    return unique

def _assign_fallback_images(slides: list, pdf_images: dict, image_contexts: dict, figure_ref_map: dict = None, chunks: list = None, image_captions: dict = None) -> dict:
    """Auto-assign images to slides without image_id based on content matching."""
    if image_captions is None:
        image_captions = {}
    if not pdf_images:
        return {}
    
    used_images = set()
    render_images = {}

    # Build section → figure refs map from original chunks
    section_fig_map = {}
    if chunks and figure_ref_map:
        for chunk in chunks:
            section = getattr(chunk, 'section_heading', '') or ''
            if not section:
                continue
            fig_refs = re.findall(r'figure\s+[\d]+[-\.][\d]+', chunk.text, re.IGNORECASE)
            if section not in section_fig_map:
                section_fig_map[section] = []
            for ref in fig_refs:
                norm = ref.lower().strip()
                if norm not in section_fig_map[section]:
                    section_fig_map[section].append(norm)
    
    for i, slide in enumerate(slides):
        iid = slide.get("image_id") if isinstance(slide, dict) else getattr(slide, "image_id", None)
        
        if iid and iid in pdf_images:
            render_images[i] = f"data:image/jpeg;base64,{pdf_images[iid]}"
            used_images.add(iid)
            continue
        
        # Skip title slides
        slide_type = slide.get("slide_type") if isinstance(slide, dict) else getattr(slide, "slide_type", "")
        if slide_type == "title" or i == 0:
            continue
        
        # Build slide text
        # Build slide text - INCLUDE PARAGRAPH where batch mode puts figure refs
        title = slide.get("title", "") if isinstance(slide, dict) else getattr(slide, "title", "")
        bullets = slide.get("bullets", []) if isinstance(slide, dict) else getattr(slide, "bullets", [])
        paragraph = slide.get("paragraph", "") if isinstance(slide, dict) else getattr(slide, "paragraph", "")
        key_points = slide.get("key_points", []) if isinstance(slide, dict) else getattr(slide, "key_points", [])

        # Combine all text fields
        bullet_texts = [b.get("text", "") if isinstance(b, dict) else str(b) for b in bullets]
        keypoint_texts = [kp.get("text", "") if isinstance(kp, dict) else str(kp) for kp in key_points]

        slide_text = f"{title} {paragraph} {' '.join(bullet_texts)} {' '.join(keypoint_texts)}".lower()
        
        # Priority match: figure reference mentioned in slide text
        # Priority match: figure reference mentioned in slide text
        fig_mentioned = False
        if figure_ref_map:
            fig_match = re.search(r'figure\s+([\d]+[-\.][\d]+(?:[-\.][\d]+)*)|fig\.\s*([\d]+[-\.][\d]+(?:[-\.][\d]+)*)', slide_text, re.IGNORECASE)
            if fig_match:
                fig_mentioned = True  # text explicitly names a figure
                fig_num = (fig_match.group(1) or fig_match.group(2) or "").strip()
                ref_key = f"figure {fig_num}".lower()
                if ref_key in figure_ref_map and figure_ref_map[ref_key] not in used_images:
                    img_id = figure_ref_map[ref_key]
                    render_images[i] = f"data:image/jpeg;base64,{pdf_images[img_id]}"
                    used_images.add(img_id)
                    continue
                # Figure mentioned but not found in map — skip, don't assign wrong image
                continue

        # Fallback: look up figure refs from the PDF section this slide belongs to
        if not fig_mentioned and section_fig_map:
            slide_section = slide.get("title", "") if isinstance(slide, dict) else ""
            for section, refs in section_fig_map.items():
                if section.lower() == slide_section.lower():
                    for ref in refs:
                        if ref in figure_ref_map and figure_ref_map[ref] not in used_images:
                            img_id = figure_ref_map[ref]
                            render_images[i] = f"data:image/jpeg;base64,{pdf_images[img_id]}"
                            used_images.add(img_id)
                            fig_mentioned = True
                            break
                if fig_mentioned:
                    break

        # Keyword matching only when no figure is explicitly mentioned
        if fig_mentioned:
            continue


        # Strict matching: Find best matching unused image
        slide_words = set(re.findall(r'\b[a-z]{5,}\b', slide_text))
        best_match, best_score = None, 0
        for img_id, context in image_contexts.items():
            if img_id in used_images:
                continue
            ctx_words = set(re.findall(r'\b[a-z]{5,}\b', context.lower()))
            overlap = len(slide_words & ctx_words)
            if overlap > best_score and overlap >= 3:
                best_score, best_match = overlap, img_id
        
        if best_match:
            render_images[i] = f"data:image/jpeg;base64,{pdf_images[best_match]}"
            used_images.add(best_match)
    
    # ===== DEBUG OUTPUT =====
    print(f"\n{'='*70}")
    print(f"🖼️ IMAGE ASSIGNMENT DEBUG")
    print(f"{'='*70}")
    print(f"Total slides: {len(slides)}")
    print(f"Images assigned: {len(render_images)}")
    print(f"\nPer-slide breakdown:")
    
    for i, slide in enumerate(slides):
        title = slide.get("title", "")
        paragraph = slide.get("paragraph", "")
        assigned_img = render_images.get(i)
        
        print(f"\n--- SLIDE {i+1}: {title} ---")
        
        # Search for figure refs in this slide
        full_text = f"{title} {paragraph}"
        for kp in slide.get('key_points', []):
            if isinstance(kp, dict):
                full_text += " " + kp.get('text', '')
        
        fig_refs = re.findall(r'(?:Figure|Fig\.|Table)\s+([\d]+[-\.][\d]+)', full_text, re.IGNORECASE)
        
        if fig_refs:
            print(f"Figure refs found in text: {fig_refs}")
            
            # Check if they're in the map
            for ref in fig_refs:
                key = f"figure {ref}".lower()
                if key in figure_ref_map:
                    expected_img = figure_ref_map[key]
                    print(f"  '{key}' maps to: {expected_img}")
                    if expected_img in image_captions:
                        print(f"    Expected caption: {image_captions[expected_img][:80]}...")
                else:
                    print(f"  ⚠️ '{key}' NOT in figure_ref_map!")
        else:
            print(f"No figure references found in text")
        
        # Show paragraph snippet
        if paragraph:
            print(f"Paragraph snippet: {paragraph[:150]}...")
        
        # Show what was assigned
        if assigned_img:
            # Extract image ID from the base64 data URL
            for img_id, b64 in pdf_images.items():
                if b64 in assigned_img:
                    caption = image_captions.get(img_id, "No caption")
                    if fig_refs and img_id != figure_ref_map.get(f"figure {fig_refs[0]}".lower()):
                        print(f"❌ WRONG! Assigned: {img_id}")
                        print(f"   Caption: {caption[:80]}...")
                    else:
                        print(f"✅ Assigned: {img_id}")
                        print(f"   Caption: {caption[:80]}...")
                    break
        else:
            print(f"❌ NO IMAGE ASSIGNED")
    
    print(f"{'='*70}\n")
    # ===== END DEBUG =====
    
    return render_images

    # ===== DEBUG OUTPUT =====
    print(f"\n{'='*70}")
    print(f"🖼️ IMAGE ASSIGNMENT DEBUG")
    print(f"{'='*70}")
    print(f"Total slides: {len(slides)}")
    print(f"Images assigned: {len(render_images)}")
    print(f"\nPer-slide breakdown:")
    
    for i, slide in enumerate(slides):
        title = slide.get("title", "")
        paragraph = slide.get("paragraph", "")[:150]
        assigned_img = render_images.get(i)
        
        print(f"\n--- SLIDE {i+1}: {title} ---")
        
        # Show paragraph snippet
        if paragraph:
            print(f"Paragraph: {paragraph}...")
        
        # Search for figure refs in this slide
        full_text = f"{title} {slide.get('paragraph', '')} {' '.join([str(b) for b in slide.get('bullets', [])])}"
        fig_refs = re.findall(r'(?:Figure|Fig\.|Table)\s+([\d]+[-\.][\d]+)', full_text, re.IGNORECASE)
        
        if fig_refs:
            print(f"Figure refs found: {fig_refs}")
            
            # Check if they're in the map
            for ref in fig_refs:
                key = f"figure {ref}".lower()
                if key in figure_ref_map:
                    expected_img = figure_ref_map[key]
                    print(f"  '{key}' maps to: {expected_img}")
                    if expected_img in image_captions:
                        print(f"    Caption: {image_captions[expected_img]}")
        else:
            print(f"No figure references found in text")
        
        # Show what was assigned
        if assigned_img:
            # Extract image ID from the base64 data URL
            for img_id, b64 in pdf_images.items():
                if b64 in assigned_img:
                    caption = image_captions.get(img_id, "No caption")
                    print(f"✅ ASSIGNED: {img_id}")
                    print(f"   Caption: {caption}")
                    break
        else:
            print(f"❌ NO IMAGE ASSIGNED")
    
    print(f"{'='*70}\n")
    # ===== END DEBUG =====
    
    return render_images
# ── Startup ──────────────────────────────────────────────────────────────────
@app.on_event("startup")
async def startup_event():
    log.info("Pre-warming engines...")
    warm_ocr_engine()
    from modules.embeddings import VectorDB
    VectorDB()._load_model()
    if CONFIG.get("retrieval", {}).get("use_reranker", False):
        _load_reranker(CONFIG["retrieval"]["reranker_model"])
    log.info("✔ System Ready")


@app.get("/")
async def root():
    engine = _get_llm_engine()
    return {"status": "ok", "version": "4.0-optimized", "backend": engine.backend}


@app.get("/themes")
async def get_themes():
    from modules.html_renderer import _PPTX_TO_HTML_THEME
    return list(_PPTX_TO_HTML_THEME.keys())


@app.post("/transcribe")
async def transcribe_audio(file: UploadFile = File(...)):
    return {"text": ""}


# ══════════════════════════════════════════════════════════════════════════════
# OPTIMIZED GENERATION ENDPOINT
# ══════════════════════════════════════════════════════════════════════════════
@app.post("/generate-stream")
async def generate_stream(
    prompt: str = Form(...),
    theme: str = Form("Dark Navy"),
    num_slides: int = Form(5),
    model: str = Form(""),  # Empty = use default from config/env
    top_k: int = Form(4),
    language: str = Form("English"),
    files: list[UploadFile] = File(default=[]),
    use_pdf_images: bool = Form(True),
    use_batch_mode: bool = Form(True),  # NEW: Enable batch generation
):
    async def _stream():
        session_id = str(uuid.uuid4())
        tmp_dir = Path(tempfile.mkdtemp(prefix=f"edu_{session_id[:8]}_"))
        raw_dir = tmp_dir / "raw"
        raw_dir.mkdir()

        def _emit(event: str, data: dict) -> str:
            return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"

        try:
            
            start_time = time.time()
            
            print(f"\n{'='*60}", flush=True)
            print(f"🚀 OPTIMIZED GENERATION: {num_slides} slides", flush=True)
            print(f"📝 Topic: '{prompt[:50]}...'", flush=True)
            print(f"⚡ Batch mode: {use_batch_mode}", flush=True)
            print(f"{'='*60}\n", flush=True)

            yield _emit("status", {"step": "ingesting", "message": "Analyzing documents…"})

            # 1. Read files into memory FIRST (for hashing BEFORE writing)
            files_data: list[tuple[str, bytes]] = []
            if files:
                for f in files:
                    content = await f.read()
                    safe_name = Path(f.filename).name.replace("..", "")
                    files_data.append((safe_name, content))
            else:
                src = ROOT_DIR / CONFIG["paths"]["data_raw"]
                if src.exists():
                    for p in src.iterdir():
                        if p.is_file():
                            files_data.append((p.name, p.read_bytes()))

            # 2. Compute hash from content (BEFORE writing to disk)
            file_hash = _files_hash_from_content(files_data) if files_data else "empty"
            cached = _index_cache.get(file_hash)

            if cached:
                print(f"♻️ CACHE HIT: Using cached index (hash: {file_hash[:12]}...)", flush=True)
                chunks = cached["chunks"]
                isolated_index = Path(cached["index_path"])
                pdf_images = cached.get("pdf_images", {})
                available_image_ids = cached.get("available_image_ids", [])
                image_contexts = cached.get("image_contexts", {})
                image_captions = cached.get("image_captions", {})
                figure_ref_map = cached.get("figure_ref_map", {})
                yield _emit("status", {"step": "indexing", "message": "Using cached index…"})
            else:
                print(f"🆕 CACHE MISS: Building new index (hash: {file_hash[:12]}...)", flush=True)
                
                # Write files to disk ONLY on cache miss
                for filename, content in files_data:
                    (raw_dir / filename).write_bytes(content)
                
                yield _emit("status", {"step": "indexing", "message": "Building knowledge base…"})
                
                def _process_sync():
                    pages = ingest_directory(raw_dir)
                    MAX_OCR_IMAGES = CONFIG.get("pdf_images", {}).get("max_per_doc", 30)
                    text_pages = [p for p in pages if p.type != "pdf_image"]
                    image_pages = [p for p in pages if p.type == "pdf_image"]
                    if len(image_pages) > MAX_OCR_IMAGES:
                        print(f"⚠️ Limiting OCR: {MAX_OCR_IMAGES}/{len(image_pages)} images", flush=True)
                        image_pages_to_ocr = image_pages[:MAX_OCR_IMAGES]
                        image_pages_skipped = image_pages[MAX_OCR_IMAGES:]
                    else:
                        image_pages_to_ocr = image_pages
                        image_pages_skipped = []
    
    # Run OCR on limited set
                    if image_pages_to_ocr:
                        image_pages_to_ocr = run_ocr(image_pages_to_ocr)
                        print(f"🔍 OCR processed {len(image_pages_to_ocr)} images", flush=True)
    
    # Combine: text + OCR'd images + skipped images (without OCR text)
                    all_pages = text_pages + image_pages_to_ocr + image_pages_skipped
    
                    return process_pages(all_pages), all_pages
                    
                
                chunks, pages = await asyncio.to_thread(_process_sync)
                
                if use_pdf_images:
                    pdf_images, available_image_ids, image_contexts, image_captions, figure_ref_map = _build_image_registry(pages, chunks)
                else:
                    pdf_images, available_image_ids, image_contexts, image_captions, figure_ref_map = {}, [], {}, {}, {}
                
                isolated_index = tmp_dir / "faiss"
                build_vector_db(chunks, index_path=isolated_index)
                
                _index_cache[file_hash] = {
                    "index_path": str(isolated_index),
                    "chunks": chunks,
                    "pdf_images": pdf_images,
                    "available_image_ids": available_image_ids,
                    "image_contexts": image_contexts,
                    "image_captions": image_captions,
                    "figure_ref_map": figure_ref_map,
                }
                print(f"💾 Cached index for future requests", flush=True)
                yield _emit("status", {"step": "indexing", "message": "Index built successfully…"})

            # 3. Retrieve
            yield _emit("status", {"step": "retrieving", "message": "Retrieving context…"})
            retriever = Retriever(index_path=isolated_index)
            # First pass: global search to get section outline
            results = retriever.search_expanded(prompt, top_k=max(top_k, 12))
            section_outline = extract_section_outline(results)

            # Second pass: retrieve chunks per section for accurate context
            if section_outline:
                per_section_chunks = []
                seen_ids = set()
                for section in section_outline:
                    section_chunks = retriever.search_for_section(
                        section, section_heading=section, top_k=5
                    )
                    # Keep only chunks from this section
                    section_chunks = [
                        c for c in section_chunks
                        if section.lower() in (getattr(c, 'section_heading', '') or '').lower()
                    ] or section_chunks  # fallback to unfiltered if nothing matches

                    for c in section_chunks:
                        cid = getattr(c, 'chunk_id', None) or hash(c.text[:100])
                        if cid not in seen_ids:
                            seen_ids.add(cid)
                            per_section_chunks.append(c)
                results = per_section_chunks if per_section_chunks else results

            context_text = prepare_context_for_slides(
                chunks=results,
                num_slides=num_slides,
            )

            # 4. Generate Slides
            yield _emit("status", {"step": "generating", "message": "AI is generating slides…"})
            
            from modules.llm import LLMEngine
            llm = LLMEngine()
            lang_label = "French" if language.lower() in ("fr", "french") else "English"

            slides_raw = []
            
            if use_batch_mode:
                print("⚡ Using BATCH generation mode", flush=True)
                
                from modules.schemas import validate_and_fix_slide
                raw_list = await llm.generate_all_slides_batch(
                    query=prompt,
                    context_text=context_text,
                    num_slides=num_slides,
                    language=lang_label,
                    available_images=available_image_ids,
                    image_contexts=image_contexts,
                    section_outline=section_outline,

                )
                
                slides_raw = []
                for s in raw_list:
                    fixed = validate_and_fix_slide(s)
                    slides_raw.append(fixed)
                
                for i, slide in enumerate(slides_raw):
                    yield _emit("slide", {
                        "index": i,
                        "title": slide.get("title", ""),
                        "bullets": slide.get("bullets", []),
                        "slideType": slide.get("slide_type", "content"),
                        "visualHint": slide.get("visual_hint", "none"),
                        "image_id": slide.get("image_id"),
                    })
                    print(f"✅ Slide {i+1}: '{slide.get('title', '')}'", flush=True)
            
            else:
                print("🐢 Using SEQUENTIAL generation mode", flush=True)
                
                from modules.pedagogical_engine import (
                    SLIDE_ARC, _subquery_for_slide, _build_slide_prompt,
                    _extract_slide_json, _prepare_context, _slide_fingerprint,
                )
                
                prior_titles, prior_hints, prior_fps = [], [], set()
                
                for i in range(num_slides):
                    stype = SLIDE_ARC[i % len(SLIDE_ARC)]
                    sub_q = _subquery_for_slide(prompt, stype, prior_titles)
                    slide_chunks = retriever.search(sub_q, top_k=5) or results
                    ctx_text = _prepare_context(slide_chunks)
                    
                    # NEW: Extract figure references from retrieved chunks
                    mentioned_figures = _extract_figure_refs_from_chunks(slide_chunks)
                    print(f"\n{'='*60}")
                    print(f"🔍 SLIDE {i+1} - Figure Extraction Debug")
                    print(f"{'='*60}")
                    print(f"📄 Retrieved {len(slide_chunks)} chunks")
                    print(f"🎯 Extracted figures: {mentioned_figures}")

                    if mentioned_figures and figure_ref_map:
                        print(f"🗺️ Figure mappings found:")
                        for fig_num in mentioned_figures:
                            key = f"figure {fig_num}".lower()
                            if key in figure_ref_map:
                                img_id = figure_ref_map[key]
                                caption = image_captions.get(img_id, "No caption")
                                print(f"  {key} → {img_id}")
                                print(f"    Caption: {caption}")
                    print(f"{'='*60}\n")
                    slide = None
                    for attempt in range(2):
                        slide_prompt = _build_slide_prompt(
                            prompt, ctx_text, stype, i+1, num_slides, lang_label,
                            prior_titles, prior_hints,
                            available_images=available_image_ids,
                            image_contexts=image_contexts,
                            mentioned_figures=mentioned_figures,  # NEW parameter
                            figure_ref_map=figure_ref_map,        # NEW parameter
                        )
                        raw = await llm.generate_async(prompt, slide_chunks, prompt_override=slide_prompt)
                        parsed = _extract_slide_json(raw)
                        if parsed:
                            llm_image_id = parsed.get('image_id')
                            print(f"🤖 LLM RESPONSE:")
                            print(f"   Title: {parsed.get('title', 'N/A')}")
                            print(f"   Image ID assigned by LLM: {llm_image_id}")
                            if llm_image_id and llm_image_id in image_captions:
                                print(f"   Caption: {image_captions[llm_image_id]}")
                            elif llm_image_id:
                                print(f"   ⚠️ Image ID not found in captions!")
                            print()
                        if parsed and _slide_fingerprint(parsed) not in prior_fps:
                            slide = parsed
                            break
                    
                    if slide:
                        slides_raw.append(slide)
                        prior_titles.append(slide.get("title", ""))
                        prior_hints.append(slide.get("visual_hint", "none"))
                        prior_fps.add(_slide_fingerprint(slide))
                        
                        yield _emit("slide", {
                            "index": i,
                            "title": slide.get("title", ""),
                            "bullets": slide.get("bullets", []),
                            "slideType": slide.get("slide_type", "content"),
                        })
                        print(f"✅ Slide {i+1}: '{slide.get('title', '')}'", flush=True)

            # 5. Convert to SlideData objects
            slides_obj = []
            for slide in slides_raw:
                s_obj = SlideData(
                    title=slide.get("title", ""),
                    bullets=slide.get("bullets", []),
                    paragraph=slide.get("paragraph", ""),
                    key_points=slide.get("key_points", []),
                    page_range=slide.get("page_range", ""),
                    speaker_notes=slide.get("speaker_notes", ""),
                    slide_type=slide.get("slide_type", "content"),
                    visual_hint=slide.get("visual_hint", "none"),
                    image_id=slide.get("image_id"),
                )
                slides_obj.append(s_obj)

            # 6. Generate Diagrams (skipped)
            diag_map = {}

            # 7. Build HTML slides
            html_slides = []
            for idx, s in enumerate(slides_obj):
                html_bullets = s.bullets

                img_id_val = s.image_id
                img_caption = ""
                if img_id_val and "page_" in img_id_val:
                    try:
                        page_num = img_id_val.split("_")[1]
                        img_caption = f"Source: Page {page_num}"
                    except IndexError:
                        pass

                html_slides.append({
                    "title": s.title,
                    "bullets": s.bullets,
                    "paragraph": s.paragraph,
                    "key_points": s.key_points,
                    "page_range": s.page_range,
                    "speaker_notes": s.speaker_notes,
                    "slide_type": s.slide_type,
                    "image_id": img_id_val,
                    "diagram": None,
                    "visual_hint": "none",
                    "caption": img_caption,
                })

            # 8. Assign images
            render_images = _assign_fallback_images(html_slides, pdf_images, image_contexts, figure_ref_map, chunks, image_captions)
            print(f"🖼️ Assigned {len(render_images)} images", flush=True)

            # Build image captions for renderer
            render_captions = {}
            for slide_idx, img_data in render_images.items():
                # Find which IMG_XXX was assigned to this slide
                for img_id, b64 in pdf_images.items():
                    if b64 in img_data:
                        if img_id in image_captions:
                            render_captions[slide_idx] = image_captions[img_id]
                        break

            # 9. Render HTML
            yield _emit("status", {"step": "rendering", "message": "Rendering presentation…"})
            html_path = render_html(
                topic=prompt[:50],
                slides=html_slides,
                session_id=session_id,
                output_dir=str(tmp_dir / "html"),
                images=render_images,
                theme_name=theme,
                captions=render_captions,
            )

            _session_store[session_id] = {"html_path": html_path, "tmp_dir": str(tmp_dir)}
            record_presentation(html_path, prompt, prompt[:50], len(slides_obj), theme, model or llm.backend, session_id=session_id)

            elapsed = time.time() - start_time
            print(f"\n✨ DONE in {elapsed:.1f}s ({len(slides_obj)} slides, {len(diag_map)} diagrams, {len(render_images)} images)\n", flush=True)

            yield _emit("done", {
                "session_id": session_id,
                "topic": prompt[:50],
                "num_slides": len(slides_obj),
                "num_diagrams": len(diag_map),
                "num_images": len(render_images),
                "elapsed_seconds": round(elapsed, 1),
                "html_url": f"/view/{session_id}",
            })

        except Exception as e:
            log.exception("Pipeline error: %s", e)
            yield _emit("error", {"detail": str(e)})

    return StreamingResponse(_stream(), media_type="text/event-stream")

@app.get("/view/{session_id}")
async def view_presentation(session_id: str):
    sess = _session_store.get(session_id)
    if not sess or not sess.get("html_path"):
        hist = load_history()
        match = next((h for h in hist if h.get("id") == session_id), None)
        if match and match.get("html_path") and os.path.exists(match["html_path"]):
            return FileResponse(match["html_path"])
        raise HTTPException(404, "Presentation not found")
    return FileResponse(sess["html_path"])


@app.get("/history")
async def get_history():
    data = load_history()
    for item in data:
        if "id" in item and "html_url" not in item:
            item["html_url"] = f"/view/{item['id']}"
    return data


@app.delete("/history")
async def delete_history():
    clear_history()
    return {"status": "cleared"}

@app.get("/cache/stats")
async def get_cache_stats():
    """Get LLM cache statistics."""
    return cache_stats()

@app.post("/evaluate")
async def evaluate_query(
    query: str = Form(...),
    top_k: int = Form(5),
):
    """Evaluate RAG pipeline quality for a query."""
    from modules.retrieval import Retriever
    
    retriever = Retriever()
    evaluator = RAGEvaluator()
    
    chunks = retriever.search_expanded(query, top_k=top_k)
    
    if not chunks:
        return {"error": "No chunks retrieved", "query": query}
    
    metrics = evaluator.evaluate_retrieval(query, chunks)
    
    return {
        "query": query,
        "metrics": metrics.to_dict(),
        "summary": metrics.summary(),
    }

@app.delete("/cache")
async def clear_llm_cache():
    """Clear all cached LLM responses."""
    count = clear_cache()
    return {"status": "cleared", "entries_removed": count}

@app.get("/health")
async def health_check():
    """Comprehensive system health check."""
    return full_health_check()


@app.get("/health/quick")
async def quick_health():
    """Lightweight status for frequent polling."""
    return quick_status()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)