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
from collections import OrderedDict

from modules.doc_generation.pedagogical_engine import _build_slide_prompt
from modules.doc_generation.image_pipeline import _build_image_registry, _extract_figure_refs_from_chunks, _assign_fallback_images


ROOT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT_DIR))

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse

from modules.core.config_loader import CONFIG, get_paths, get_index_path
from modules.ingestion.ingestion import ingest_directory
from modules.ingestion.ocr import run_ocr, warm_ocr_engine
from modules.ingestion.text_processing import process_pages
from modules.retrieval.embeddings import build_vector_db
from modules.retrieval.retrieval import Retriever, _load_reranker
from modules.doc_generation.slide_generator import SlideData
from modules.core.history_store import record_presentation, load_history, clear_history
from modules.doc_generation.html_renderer import render as render_html
from modules.retrieval.context_manager import prepare_context_for_slides, extract_section_outline
from modules.core.llm_cache import clear_cache, cache_stats
from modules.retrieval.evaluation import RAGEvaluator
from modules.core.health import full_health_check, quick_status
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
class LRUCache(OrderedDict):
    def __init__(self, maxsize=10):
        super().__init__()
        self.maxsize = maxsize
    def __getitem__(self, key):
        value = super().__getitem__(key)
        self.move_to_end(key)
        return value
    def __setitem__(self, key, value):
        super().__setitem__(key, value)
        if len(self) > self.maxsize:
            oldest = next(iter(self))
            del self[oldest]

_index_cache = LRUCache(maxsize=10)
_session_store: dict[str, dict] = {}
_llm_engines: dict[str, 'LLMEngine'] = {}

def _get_llm_engine(namespace="generate_presentation"):
    """Get or create cached LLM engine instance per namespace."""
    if namespace not in _llm_engines:
        from modules.doc_generation.llm import LLMEngine
        _llm_engines[namespace] = LLMEngine(namespace=namespace)
    return _llm_engines[namespace]

def _files_hash_from_content(files_data: list[tuple[str, bytes]]) -> str:
    """Compute hash from file content BEFORE writing to disk."""
    h = hashlib.sha1()
    for name, content in sorted(files_data, key=lambda x: x[0]):
        h.update(name.encode())
        h.update(content)
    return h.hexdigest()





# ── Startup ──────────────────────────────────────────────────────────────────
@app.on_event("startup")
async def startup_event():
    log.info("Pre-warming engines...")
    warm_ocr_engine()
    from modules.retrieval.embeddings import VectorDB
    VectorDB()._load_model()
    if CONFIG.get("retrieval", {}).get("use_reranker", False):
        _load_reranker(CONFIG["retrieval"]["reranker_model"])
    log.info("✔ System Ready")


@app.on_event("shutdown")
async def shutdown_event():
    for engine in _llm_engines.values():
        await engine.aclose()
    log.info("HTTP clients closed.")


@app.get("/")
async def root():
    engine = _get_llm_engine()
    return {"status": "ok", "version": "4.0-optimized", "backend": engine.backend}


@app.get("/themes")
async def get_themes():
    from modules.doc_generation.html_renderer import _PPTX_TO_HTML_THEME
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
    max_slides: int = Form(20),
    model: str = Form(""),
    language: str = Form("English"),
    files: list[UploadFile] = File(default=[]),
    use_pdf_images: bool = Form(True),
    use_batch_mode: bool = Form(True),
    namespace: str = Form("generate_presentation"),
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
            print(f"🚀 OPTIMIZED GENERATION: max_slides={max_slides}", flush=True)
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
                ns_paths = get_paths(namespace)
                src = ROOT_DIR / ns_paths["data_raw"]
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
                img_page_map = cached.get("img_page_map", {})
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
                    pdf_images, available_image_ids, image_contexts, image_captions, figure_ref_map, img_page_map = _build_image_registry(pages, chunks)
                else:
                    pdf_images, available_image_ids, image_contexts, image_captions, figure_ref_map, img_page_map = {}, [], {}, {}, {}, {}
                
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
                    "img_page_map": img_page_map,
                }
                print(f"💾 Cached index for future requests", flush=True)
                yield _emit("status", {"step": "indexing", "message": "Index built successfully…"})

            # 3. Retrieve
            yield _emit("status", {"step": "retrieving", "message": "Retrieving context…"})
            retriever = Retriever(index_path=isolated_index)

            # ── Content-driven slide count ────────────────────────────────────
            # 1. Cast a wide net to find all relevant sections
            results = retriever.search_expanded(prompt, top_k=40)
            section_outline = extract_section_outline(results)

            # 2. For each section, fetch its chunks to measure content volume
            section_chunk_bank = {}
            for section in section_outline:
                raw = retriever.search_for_section(
                    section, section_heading=section, top_k=20
                )
                strict = [
                    c for c in raw
                    if section.lower() in (getattr(c, 'section_heading', '') or '').lower()
                ] or raw[:4]
                strict.sort(key=lambda c: getattr(c, 'page', 0))
                section_chunk_bank[section] = strict

            # 3. Assign slides proportionally to content volume
            # Sections with more chunks get more slides (up to 3 per section)
            # Sections with very few chunks (≤2) get 1 slide
            CHUNKS_PER_SLIDE = 4   # ~4 chunks worth of content per slide
            expanded_outline = []  # final list of (section, slide_count) pairs
            for section in section_outline:
                chunk_count = len(section_chunk_bank.get(section, []))
                slides_for_section = max(1, min(3, round(chunk_count / CHUNKS_PER_SLIDE)))
                expanded_outline.append((section, slides_for_section))

            total_content_slides = sum(c for _, c in expanded_outline)
            # Cap at user's max (leave 2 for title + summary)
            content_cap = max_slides - 2
            if total_content_slides > content_cap:
                # Scale down proportionally
                scale = content_cap / total_content_slides
                expanded_outline = [
                    (s, max(1, round(c * scale))) for s, c in expanded_outline
                ]
                total_content_slides = sum(c for _, c in expanded_outline)

            num_slides = total_content_slides + 2  # +2 for title + summary
            # Rebuild section_outline with repetitions for multi-slide sections
            section_outline = []
            for section, count in expanded_outline:
                for _ in range(count):
                    section_outline.append(section)

            print(f"📊 Content-driven: {len(expanded_outline)} sections → {total_content_slides} content slides → {num_slides} total (max={max_slides})", flush=True)
            for sec, cnt in expanded_outline:
                print(f"   {'📄' if cnt == 1 else '📚'} {sec[:50]} → {cnt} slide{'s' if cnt > 1 else ''}", flush=True)

            yield _emit("status", {"step": "retrieving", "message": "Retrieving context…"})

            # 4. Build per-section chunk pool for context
            if section_outline:
                per_section_chunks = []
                seen_ids = set()
                section_slide_idx = {}
                _section_occ: dict[str, int] = {}
                for _s in section_outline:
                    _section_occ[_s] = _section_occ.get(_s, 0) + 1

                for section in section_outline:
                    all_chunks = section_chunk_bank.get(section, [])
                    idx = section_slide_idx.get(section, 0)
                    section_slide_idx[section] = idx + 1
                    total_occ = _section_occ[section]
                    chunk_count = len(all_chunks)
                    slice_size = max(2, chunk_count // total_occ)
                    start = idx * slice_size
                    end = start + slice_size if idx < total_occ - 1 else chunk_count
                    slice_chunks = all_chunks[start:end] or all_chunks[:2]

                    for c in slice_chunks:
                        cid = getattr(c, 'chunk_id', None) or hash(c.text[:100])
                        if cid not in seen_ids:
                            seen_ids.add(cid)
                            per_section_chunks.append(c)
                results = per_section_chunks if per_section_chunks else results

            context_text = prepare_context_for_slides(
                chunks=results,
                num_slides=num_slides,
            )

            # 3b. Extract ideas per section for multi-slide sections
            yield _emit("status", {"step": "generating", "message": "Analyzing section ideas…"})
            llm = _get_llm_engine(namespace=namespace)
            lang_label = "French" if language.lower() in ("fr", "french") else "English"

            # Build idea-level outline
            # For sections appearing once → keep as plain string
            # For sections appearing multiple times → extract ideas and expand
            idea_outline = []  # list of str or {section, focus}
            section_counts = {}
            for s in section_outline:
                section_counts[s] = section_counts.get(s, 0) + 1

            section_idea_idx = {}
            for section in section_outline:
                count = section_counts[section]
                if count == 1:
                    # Single slide for this section — no idea extraction needed
                    idea_outline.append(section)
                else:
                    # Multiple slides — extract ideas if not done yet
                    if section not in section_idea_idx:
                        # Get the chunks for this section
                        sec_chunks = section_chunk_bank.get(section, [])
                        chunks_text = "\n\n".join(
                            getattr(c, 'text', '') for c in sec_chunks
                        )
                        ideas = await llm.extract_ideas_from_section(
                            section_name=section,
                            chunks_text=chunks_text,
                            max_ideas=min(count, 3),
                            language=lang_label,
                        )
                        # Fallback if extraction failed
                        if not ideas:
                            ideas = [
                                f"Theory and definition of {section}",
                                f"Implementation and examples of {section}",
                                f"Parameters and limitations of {section}",
                            ][:count]
                        section_idea_idx[section] = ideas

                    ideas = section_idea_idx[section]
                    idx = sum(1 for e in idea_outline
                              if isinstance(e, dict) and e.get('section') == section)
                    focus = ideas[idx] if idx < len(ideas) else ideas[-1]
                    idea_outline.append({"section": section, "focus": focus})

            # Add title and summary slots
            final_outline = idea_outline  # title/summary handled by prompt rules

            # Cap num_slides to avoid asking LLM for more slides than we have unique content.
            # The batch prompt accounts for title (slide 1) + summary (last slide) automatically,
            # so the content slots = len(final_outline). Total = content + title + summary.
            max_content_slides = len(final_outline)
            if max_content_slides > 0:
                capped = max_content_slides + 2  # +2 for title and summary
                if num_slides > capped:
                    log.info(f"Capping num_slides from {num_slides} → {capped} (only {max_content_slides} unique sections)")
                    num_slides = capped

            log.info(f"Idea outline: {len(final_outline)} entries for {num_slides} slides")

            # 4. Generate Slides
            yield _emit("status", {"step": "generating", "message": "AI is generating slides…"})

            slides_raw = []

            if use_batch_mode:
                print("⚡ Using BATCH generation mode", flush=True)
                
                from modules.core.schemas import validate_and_fix_slide
                raw_list = await llm.generate_all_slides_batch(
                    query=prompt,
                    context_text=context_text,
                    num_slides=num_slides,
                    language=lang_label,
                    available_images=available_image_ids,
                    image_contexts=image_contexts,
                    section_outline=final_outline,
                )
                
                slides_raw = []
                for s in raw_list:
                    fixed = validate_and_fix_slide(s)
                    slides_raw.append(fixed)

                # Post-process: remove duplicate figure references across slides
                used_fig_refs = set()
                for slide in slides_raw:
                    para = slide.get("paragraph", "")
                    if not para:
                        continue
                    fig_refs_in_slide = re.findall(
                        r'Figure\s+[\d]+[-\.][\d]+|Fig\.\s*[\d]+[-\.][\d]+',
                        para, re.IGNORECASE
                    )
                    for ref in fig_refs_in_slide:
                        norm = ref.lower().strip()
                        if norm in used_fig_refs:
                            # Remove this duplicate reference from the paragraph, along with common surrounding text
                            pattern = r'(?i)(?:,\s*)?(?:as\s+)?(?:shown|seen)\s+in\s*' + re.escape(ref) + r'\b|\(?' + re.escape(ref) + r'\)?'
                            slide["paragraph"] = re.sub(
                                pattern, '', slide["paragraph"]
                            ).strip()
                            # Clean up formatting artifacts left behind
                            slide["paragraph"] = re.sub(r'\s+', ' ', slide["paragraph"])
                            slide["paragraph"] = re.sub(r',\s*\.', '.', slide["paragraph"])
                            slide["paragraph"] = re.sub(r'\(\s*\)', '', slide["paragraph"])
                            log.info(f"Removed duplicate figure ref '{ref}' from slide '{slide.get('title','')[:30]}'")
                        else:
                            used_fig_refs.add(norm)

                # Post-process: Add line breaks to long paragraphs for better aesthetics
                for slide in slides_raw:
                    para = slide.get("paragraph", "")
                    if para and len(para) > 200:
                        # Split after 2 or 3 sentences (roughly)
                        sentences = re.split(r'(?<=[.!?])\s+', para)
                        if len(sentences) > 3:
                            new_para = ""
                            for i, sent in enumerate(sentences):
                                new_para += sent + " "
                                if (i + 1) % 3 == 0 and (i + 1) < len(sentences):
                                    new_para = new_para.strip() + "\n\n"
                            slide["paragraph"] = new_para.strip()

                # Post-process: remove near-duplicate slides (same title OR same opening content)
                def _norm_title(t: str) -> str:
                    # Normalize: lowercase, collapse spaces, strip trailing 's' for basic stemming
                    return re.sub(r'\s+', ' ', t.lower().strip().rstrip('s'))

                def _content_fingerprint(slide: dict) -> str:
                    # First 80 chars of paragraph — catches slides with different titles but same content
                    para = slide.get("paragraph", "") or ""
                    return re.sub(r'\s+', ' ', para[:80].lower().strip())

                seen_titles_norm = set()
                seen_content_fps = set()
                deduped_slides = []
                for slide in slides_raw:
                    stype = slide.get("slide_type", "")
                    title_norm = _norm_title(slide.get("title", ""))
                    content_fp = _content_fingerprint(slide)
                    # Always keep title and summary slides
                    if stype in ("title", "summary") or not title_norm:
                        deduped_slides.append(slide)
                        continue
                    is_dup_title   = title_norm in seen_titles_norm
                    is_dup_content = content_fp and content_fp in seen_content_fps
                    if not is_dup_title and not is_dup_content:
                        seen_titles_norm.add(title_norm)
                        if content_fp:
                            seen_content_fps.add(content_fp)
                        deduped_slides.append(slide)
                    else:
                        reason = "title" if is_dup_title else "content"
                        log.warning(f"Dropping duplicate slide ({reason}): '{slide.get('title', '')}'")
                        print(f"⚠️ Dropped duplicate slide ({reason}): '{slide.get('title', '')}'", flush=True)
                slides_raw = deduped_slides
                
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
                    para = slide.get("paragraph", "")
                    kps  = slide.get("key_points", [])
                    if para:
                        print(f"   📝 {para[:400]}{'...' if len(para) > 400 else ''}", flush=True)
                    if kps:
                        for kp in kps:
                            txt = kp.get("text", kp) if isinstance(kp, dict) else kp
                            print(f"   • {txt}", flush=True)
                    print(flush=True)
            
            else:
                print("🐢 Using SEQUENTIAL generation mode", flush=True)
                
                from modules.doc_generation.pedagogical_engine import (
                    SLIDE_ARC, _subquery_for_slide, _build_slide_prompt,
                    _extract_slide_json, _prepare_context, _slide_fingerprint,
                )
                
                prior_titles, prior_hints, prior_fps = [], [], set()
                
                for i in range(num_slides):
                    stype = SLIDE_ARC[i % len(SLIDE_ARC)]
                    sub_q = _subquery_for_slide(prompt, stype, prior_titles)
                    slide_chunks = retriever.search(sub_q, top_k=5) or results
                    ctx_text = _prepare_context(slide_chunks)
                    
                    mentioned_figures = _extract_figure_refs_from_chunks(slide_chunks)
                    log.debug("Slide %d: figures %s from %d chunks", i + 1, mentioned_figures, len(slide_chunks))
                    slide = None
                    for attempt in range(2):
                        slide_prompt = _build_slide_prompt(
                            prompt, ctx_text, stype, i+1, num_slides, lang_label,
                            prior_titles, prior_hints,
                            available_images=available_image_ids,
                            image_contexts=image_contexts,
                            mentioned_figures=mentioned_figures,
                            figure_ref_map=figure_ref_map,
                        )
                        raw = await llm.generate_async(prompt, slide_chunks, prompt_override=slide_prompt)
                        parsed = _extract_slide_json(raw)
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
            diag_map = {}  # diagram generation not yet implemented
            render_images = _assign_fallback_images(html_slides, pdf_images, image_contexts, figure_ref_map, chunks, image_captions)
            print(f"🖼️ Assigned {len(render_images)} images", flush=True)

            # Build image captions for renderer (caption + page number)
            # Reverse map built once — avoids O(n·m) b64 substring search per slide
            _b64_to_img_id = {v: k for k, v in pdf_images.items()}
            render_captions = {}
            for slide_idx, img_data in render_images.items():
                img_data_str = img_data[0] if isinstance(img_data, list) else img_data
                b64_part = img_data_str.split(",", 1)[1] if "," in img_data_str else img_data_str
                img_id = _b64_to_img_id.get(b64_part)
                if img_id:
                    cap = image_captions.get(img_id, "")
                    pg  = img_page_map.get(img_id, 0)
                    if cap and pg:
                        render_captions[slide_idx] = f"{cap} — Page {pg}"
                    elif cap:
                        render_captions[slide_idx] = cap
                    elif pg:
                        render_captions[slide_idx] = f"Page {pg}"

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
                section_outline=final_outline,
            )

            _session_store[session_id] = {
                "html_path": html_path,
                "tmp_dir": str(tmp_dir),
                "slides": html_slides,
                "images": render_images,
                "captions": render_captions,
                "topic": prompt[:50],
                "theme": theme,
                "section_outline": final_outline,
            }
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


@app.post("/reorder/{session_id}")
async def reorder_presentation(session_id: str, body: dict):
    """Re-render the presentation with a new slide order.
    Body: { "order": [0, 3, 1, 2, 4] } — indices into the original slides list.
    Title (index 0), intro (index 1), and summary (last) are locked by the frontend.
    """
    sess = _session_store.get(session_id)
    if not sess or "slides" not in sess:
        raise HTTPException(404, "Session not found or slides not available")

    order = body.get("order", [])
    slides = sess["slides"]

    if not order or len(order) > len(slides):
        raise HTTPException(400, f"Invalid order: got {len(order)}, expected at most {len(slides)}")

    reordered = [slides[i] for i in order]

    html_path = render_html(
        topic=sess["topic"],
        slides=reordered,
        session_id=session_id,
        output_dir=str(Path(sess["tmp_dir"]) / "html"),
        images=sess.get("images", {}),
        theme_name=sess["theme"],
        captions=sess.get("captions", {}),
        section_outline=sess.get("section_outline"),
    )
    sess["html_path"] = html_path
    return {"html_url": f"/view/{session_id}"}


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
    from modules.retrieval.retrieval import Retriever
    
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
    """Clear all cached LLM responses across all namespaces."""
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


# ══════════════════════════════════════════════════════════════════════════════
# QUIZ GENERATION ENDPOINTS
# ══════════════════════════════════════════════════════════════════════════════

@app.post("/quiz/concepts")
async def quiz_concepts(
    topic: str = Form(...),
    language: str = Form("English"),
):
    """Step 1 — Extract concept tree for a topic."""
    from modules.quiz_generation import QuizGenerator
    gen = QuizGenerator(namespace="quiz")
    result = await gen.extract_concepts(topic, language=language)
    return result


@app.get("/quiz/history")
async def quiz_history():
    """Return list of saved quiz JSON files from outputs/quiz_exports/."""
    exports_dir = ROOT_DIR / "outputs" / "quiz_exports"
    if not exports_dir.exists():
        return {"quizzes": []}
    quizzes = []
    for f in sorted(exports_dir.glob("*.json"), key=lambda x: x.stat().st_mtime, reverse=True):
        try:
            with open(f, encoding="utf-8") as fp:
                data = json.load(fp)
            quizzes.append({
                "filename": f.name,
                "topic": data.get("topic", f.stem),
                "total": data.get("total", len(data.get("questions", []))),
                "generated": data.get("generated", ""),
            })
        except Exception:
            pass
    return {"quizzes": quizzes}


@app.post("/quiz/generate")
async def quiz_generate(
    topic: str = Form(...),
    selected_concepts: str = Form(...),
    total_questions: int = Form(10),
    image_questions_count: int = Form(0),
    language: str = Form("English"),
    seed: str = Form(""),
):
    """Step 3 — Generate quiz questions."""
    from modules.quiz_generation import QuizGenerator
    import json as _json
    gen = QuizGenerator(namespace="quiz")
    try:
        concepts = _json.loads(selected_concepts)
    except Exception:
        raise HTTPException(status_code=400, detail="selected_concepts must be a JSON array")
    questions = await gen.generate_quiz(
        topic=topic,
        selected_concepts=concepts,
        total_questions=total_questions,
        image_questions_count=image_questions_count,
        language=language,
        seed=seed,
    )
    # Auto-save to quiz_exports for history
    if questions:
        try:
            from modules.quiz_generation import QuizExporter
            QuizExporter().to_json(questions, topic=topic)
        except Exception:
            pass
    return {"questions": questions}


@app.post("/quiz/image")
async def quiz_image(
    image_prompt: str = Form(...),
    concept: str = Form(""),
    filename: str = Form(""),
):
    """Generate an SVG diagram for an image-type question."""
    from modules.quiz_generation import QuizImageGenerator
    img_gen = QuizImageGenerator(namespace="quiz")
    svg = await img_gen.generate_image(
        image_prompt=image_prompt,
        concept=concept,
    )
    if not svg:
        raise HTTPException(status_code=500, detail="SVG generation failed")
    from fastapi.responses import Response
    return Response(content=svg, media_type="image/svg+xml")


# ══════════════════════════════════════════════════════════════════════════════
# AI DEBATE PARTNER ENDPOINTS
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/debate/preview/{conversation_id}/{page}")
async def debate_page_preview(conversation_id: str, page: int):
    """Lazily render and return a PDF page thumbnail as PNG."""
    from modules.ai_debate_partner.rag_retriever import get_or_render_thumbnail
    import asyncio
    path = await asyncio.to_thread(get_or_render_thumbnail, conversation_id, page)
    if not path:
        raise HTTPException(404, "Page not found or PDF not stored")
    return FileResponse(str(path), media_type="image/png")


@app.post("/debate/animation")
async def debate_animation(
    topic: str = Form(...),
    conversation_id: str = Form(""),
):
    """Generate a Manim educational animation for a topic."""
    from modules.ai_debate_partner.animation_engine import AnimationEngine
    engine = AnimationEngine()
    result = await engine.generate(topic)
    if "error" in result:
        raise HTTPException(500, result["error"])
    video_path = result["video_path"]
    filename = Path(video_path).name
    return {
        "video_url": f"/debate/animation/video/{filename}",
        "description": result.get("description", ""),
        "topic": topic,
    }


@app.get("/debate/animation/video/{filename}")
async def debate_animation_video(filename: str):
    """Serve a rendered animation video."""
    from pathlib import Path as _Path
    videos_dir = ROOT_DIR / "outputs" / "animations"
    path = videos_dir / filename
    if not path.exists():
        raise HTTPException(404, "Video not found")
    return FileResponse(str(path), media_type="video/mp4")


@app.post("/debate/document-intro")
async def debate_document_intro(
    conversation_id: str = Form(...),
    filename: str = Form(""),
    language: str = Form("English"),
):
    """
    After a document is uploaded, generate a contextual intro message
    with suggested actions the user can take.
    Returns the assistant message and a list of suggestion chips.
    """
    from modules.ai_debate_partner.rag_retriever import retrieve
    from modules.ai_debate_partner import DebateEngine

    # Retrieve a broad sample of the document to understand its content
    sample = retrieve(conversation_id, "main topics overview introduction", top_k=6)
    if not sample:
        return {
            "message": f"I've indexed **{filename}**. What would you like to do with it?",
            "suggestions": [
                {"label": "📋 Summarize the course", "prompt": "Please summarize the main topics of this course in bullet points."},
                {"label": "🔍 What is this course about?", "prompt": "Give me a brief overview of what this course covers."},
                {"label": "🗂️ List all chapters/sections", "prompt": "List all the chapters and sections of this course using Roman numerals for chapters (I. II. III.) and bullet points (* ) for sections inside each chapter. For each item include the page number at the end in the format (p.X). Be thorough and hierarchical. Example:\nI. Introduction\n  * Overview (p.1)\nII. Chapter Name\n  * Section name (p.5)\n  * Section name (p.8)"},
                {"label": "❓ Quiz me on this course", "prompt": "Generate 5 quiz questions based on the most important concepts in this course."},
            ]
        }

    engine = DebateEngine(namespace="aria")
    prompt = f"""\
A student just uploaded a course document called "{filename}".
Here is a sample of the document content:

{sample[:2000]}

Write a SHORT, warm, conversational message (2-3 sentences max) in {language}:
1. Acknowledge the document by name
2. Briefly mention what it seems to be about (1 sentence)
3. Ask what they'd like to do

Write in plain text only. No markdown. Be friendly and concise like Aria would."""

    if engine.llm.backend == "groq":
        message = await engine.llm._call_groq(prompt, json_mode=False)
    else:
        message = await engine.llm._call_ollama(prompt, engine.llm.ollama_model, json_mode=False)

    return {
        "message": message.strip(),
        "suggestions": [
            {"label": "📋 Summarize the course", "prompt": "Please summarize the main topics of this course in clear bullet points."},
            {"label": "🔍 What is this course about?", "prompt": "Give me a brief overview of what this course covers and its main objectives."},
            {"label": "🗂️ List all chapters/sections", "prompt": "List all the chapters and sections of this course using Roman numerals for chapters (I. II. III.) and bullet points (* ) for sections inside each chapter. For each item include the page number at the end in the format (p.X). Be thorough and hierarchical. Example:\nI. Introduction\n  * Overview (p.1)\nII. Chapter Name\n  * Section name (p.5)\n  * Section name (p.8)"},
            {"label": "❓ Quiz me on this course", "prompt": "Generate 5 quiz questions based on the most important concepts in this course."},
        ]
    }


@app.post("/debate/upload")
async def debate_upload(
    file: UploadFile = File(...),
    conversation_id: str = Form(...),
):
    """Upload a PDF and build an isolated RAG index for this conversation."""
    from modules.ai_debate_partner.rag_retriever import build_index_from_bytes
    from modules.ai_debate_partner.memory_store import MemoryStore

    if not conversation_id:
        raise HTTPException(400, "conversation_id is required")

    content = await file.read()
    if not content:
        raise HTTPException(400, "Empty file")

    chunk_count = await build_index_from_bytes(
        conversation_id=conversation_id,
        filename=file.filename or "document.pdf",
        file_bytes=content,
    )

    if chunk_count == 0:
        raise HTTPException(422, "Could not extract text from the document")

    # Save PDF for thumbnail generation
    from modules.ai_debate_partner.rag_retriever import save_pdf
    save_pdf(conversation_id, content)

    # Record document in MongoDB
    MemoryStore().set_document(conversation_id, file.filename or "document.pdf", chunk_count)

    return {
        "status": "indexed",
        "filename": file.filename,
        "chunks": chunk_count,
        "conversation_id": conversation_id,
    }


@app.post("/debate/chat")
async def debate_chat(
    message: str = Form(...),
    mode: str = Form("auto"),
    source: str = Form("mix"),
    history: str = Form("[]"),
    conversation_id: str = Form(""),
    language: str = Form("en"),
):
    from modules.ai_debate_partner import DebateEngine
    import json as _json
    try:
        history_list = _json.loads(history)
    except Exception:
        history_list = []
    engine = DebateEngine(namespace="aria")
    reply = await engine.chat(
        message=message, mode=mode, source=source,
        history=history_list if not conversation_id else None,
        conversation_id=conversation_id,
        language=language,
    )
    return {"reply": reply, "mode": mode}


@app.post("/debate/chat-stream")
async def debate_chat_stream(
    message: str = Form(...),
    mode: str = Form("auto"),
    source: str = Form("mix"),
    history: str = Form("[]"),
    conversation_id: str = Form(""),
    language: str = Form("en"),
):
    from modules.ai_debate_partner import DebateEngine
    from fastapi.responses import StreamingResponse
    import json as _json
    try:
        history_list = _json.loads(history)
    except Exception:
        history_list = []
    engine = DebateEngine(namespace="aria")
    async def _stream():
        async for chunk in engine.chat_stream(
            message=message, mode=mode, source=source,
            history=history_list if not conversation_id else None,
            conversation_id=conversation_id,
            language=language,
        ):
            yield f"data: {_json.dumps({'chunk': chunk})}\n\n"
        yield "data: [DONE]\n\n"
    return StreamingResponse(_stream(), media_type="text/event-stream")


@app.get("/debate/conversations")
async def debate_list_conversations():
    """List all saved conversations."""
    from modules.ai_debate_partner.memory_store import MemoryStore
    store = MemoryStore()
    convos = store.list_conversations()
    # Convert datetime to string for JSON serialization
    for c in convos:
        for k in ("updated_at", "created_at"):
            if k in c and hasattr(c[k], "isoformat"):
                c[k] = c[k].isoformat()
    return {"conversations": convos}


@app.get("/debate/conversations/{conversation_id}")
async def debate_get_conversation(conversation_id: str):
    """Get full history of a conversation."""
    from modules.ai_debate_partner.memory_store import MemoryStore
    store = MemoryStore()
    history = store.get_history(conversation_id)
    return {"conversation_id": conversation_id, "history": history}


@app.delete("/debate/conversations/{conversation_id}")
async def debate_delete_conversation(conversation_id: str):
    from modules.ai_debate_partner.memory_store import MemoryStore
    MemoryStore().delete_conversation(conversation_id)
    return {"status": "deleted"}


@app.delete("/debate/conversations")
async def debate_clear_all_conversations():
    """Delete all conversations from MongoDB."""
    from modules.ai_debate_partner.memory_store import MemoryStore
    from modules.ai_debate_partner.rag_retriever import DEBATE_INDEX_DIR
    import shutil
    store = MemoryStore()
    convos = store.list_conversations()
    for c in convos:
        store.delete_conversation(c["conversation_id"])
    # Also wipe all debate indexes
    if DEBATE_INDEX_DIR.exists():
        shutil.rmtree(DEBATE_INDEX_DIR)
        DEBATE_INDEX_DIR.mkdir(parents=True, exist_ok=True)
    return {"status": "cleared", "deleted": len(convos)}


@app.get("/debate/profile")
async def debate_get_profile():
    from modules.ai_debate_partner.memory_store import MemoryStore
    profile = MemoryStore().get_profile()
    for k in ("updated_at",):
        if k in profile and hasattr(profile[k], "isoformat"):
            profile[k] = profile[k].isoformat()
    return profile


@app.post("/debate/profile")
async def debate_update_profile(updates: str = Form(...)):
    from modules.ai_debate_partner.memory_store import MemoryStore
    import json as _json
    try:
        data = _json.loads(updates)
    except Exception:
        raise HTTPException(400, "updates must be valid JSON")
    MemoryStore().update_profile(data)
    return {"status": "updated"}


# ─────────────────────────────────────────────────────────────────────────────
# EXAM SIMULATOR
# ─────────────────────────────────────────────────────────────────────────────

@app.get("/exam/suggestions")
async def exam_suggestions(q: str = ""):
    """Return 5 topic suggestions for the exam config autocomplete."""
    if not q or len(q.strip()) < 2:
        return {"suggestions": []}
    from modules.exam_generation.exam_engine import ExamEngine
    engine = ExamEngine()
    suggestions = await engine.get_suggestions(q.strip())
    return {"suggestions": suggestions}


@app.get("/exam/focus-suggestions")
async def exam_focus_suggestions(topic: str = "", q: str = ""):
    """Return 8 subtopic suggestions for the focus field based on the main topic."""
    if not topic or len(topic.strip()) < 2:
        return {"suggestions": []}
    from modules.exam_generation.exam_engine import ExamEngine
    engine = ExamEngine()
    suggestions = await engine.get_focus_suggestions(topic.strip(), q.strip())
    return {"suggestions": suggestions}


@app.post("/exam/generate")
async def exam_generate(request: Request):
    """Generate a complete exam from a prompt configuration."""
    body = await request.json()
    topic      = body.get("topic", "").strip()
    focus      = body.get("focus", "").strip()
    difficulty = body.get("difficulty", "Medium")
    mix        = body.get("mix", {"mcq": 3, "truefalse": 0, "problem": 1, "casestudy": 1})
    time_limit = body.get("time_limit", "30 min")
    language   = body.get("language", "English")

    if not topic:
        raise HTTPException(400, "topic is required")
    total = sum(mix.values())
    if total == 0:
        raise HTTPException(400, "at least one question type must be selected")

    from modules.exam_generation.exam_engine import ExamEngine
    engine = ExamEngine()
    try:
        exam = await engine.generate_exam(topic, focus, difficulty, mix, language)
        exam["time_limit"] = time_limit
        return exam
    except Exception as e:
        log.error(f"Exam generation failed: {e}")
        raise HTTPException(500, f"Failed to generate exam: {str(e)}")


@app.post("/exam/grade")
async def exam_grade(request: Request):
    """Grade a free-text answer (problem solving or case study)."""
    body = await request.json()
    question       = body.get("question", {})
    student_answer = body.get("student_answer", "").strip()
    language       = body.get("language", "English")

    if not question or not student_answer:
        raise HTTPException(400, "question and student_answer are required")

    from modules.exam_generation.exam_engine import ExamEngine
    engine = ExamEngine()
    result = await engine.grade_answer(question, student_answer, language)
    return result


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)