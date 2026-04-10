"""
image_matcher.py — Smart Figure-to-Slide Matching
===================================================
FIXES the wrong image assignment problem:

OLD BEHAVIOR (broken):
- Slide about "k-neighbors regression" gets Figure 2-7 
  because they're on the same page

NEW BEHAVIOR (correct):
- Slide text says "as shown in Figure 2-8" → gets Figure 2-8
- Falls back to semantic matching only if no explicit reference

PRIORITY ORDER:
1. Explicit figure reference in slide text ("Figure 2-8")
2. Explicit figure reference in slide title
3. Figure reference in source_id of bullets  
4. Semantic word overlap (original fallback)
"""

import re
import logging
from typing import Optional

log = logging.getLogger("image_matcher")


def _extract_figure_refs_from_text(text: str) -> list[str]:
    """
    Extract all figure numbers mentioned in text.
    
    "as shown in Figure 2-8" -> ["2-8"]
    "See Fig. 3.1 and Figure 3.2" -> ["3.1", "3.2"]
    """
    if not text:
        return []
    
    patterns = [
        r'Figure\s+([\d][-.\d]*)',
        r'Fig\.\s*([\d][-.\d]*)',
        r'Table\s+([\d][-.\d]*)',
    ]
    
    refs = []
    for pattern in patterns:
        matches = re.findall(pattern, text, re.IGNORECASE)
        refs.extend(matches)
    
    # Deduplicate
    return list(dict.fromkeys(refs))


def _normalize_figure_number(fig_num: str) -> str:
    """
    Normalize figure number for matching.
    "2-8" -> "2-8"
    "2.8" -> "2.8"  
    Both should match if we normalize dashes/dots
    """
    return fig_num.strip().replace(" ", "")


def _build_figure_index(pages: list, pdf_images: dict) -> dict:
    """
    Build mapping from figure_number to image_id.
    
    Returns: {"2-7": "IMG_001", "2-8": "IMG_002", ...}
    """
    figure_to_img = {}
    
    for page in pages:
        if page.type != "pdf_image":
            continue
            
        fig_num = getattr(page, 'figure_number', '') or ''
        if not fig_num:
            # Try to extract from figure_ref
            fig_ref = getattr(page, 'figure_ref', '') or ''
            if fig_ref:
                fig_num = re.sub(r'^(Figure|Fig\.?|Table)\s*', '', fig_ref, flags=re.IGNORECASE).strip()
        
        if not fig_num:
            continue
        
        # Find corresponding IMG_XXX id
        caption = getattr(page, 'caption', '') or ''
        for img_id in pdf_images.keys():
            # Match by checking if this is the right image
            # We need to trace back from the page to the IMG_XXX
            # For now, use a simple page-based heuristic
            if f"page {page.page}" in page.source.lower() or f"page{page.page}" in page.source.lower():
                if fig_num not in figure_to_img:
                    figure_to_img[fig_num] = img_id
                    log.debug(f"  Figure {fig_num} -> {img_id}")
                    break
    
    return figure_to_img


def build_figure_to_image_map(pages: list) -> dict:
    """
    Build a direct mapping from figure numbers to image data.
    
    Returns: {
        "2-7": {"b64": "...", "caption": "...", "page": 5},
        "2-8": {"b64": "...", "caption": "...", "page": 5},
    }
    """
    figure_map = {}
    
    for page in pages:
        if page.type != "pdf_image":
            continue
        
        fig_num = getattr(page, 'figure_number', '') or ''
        if not fig_num:
            fig_ref = getattr(page, 'figure_ref', '') or ''
            if fig_ref:
                fig_num = re.sub(r'^(Figure|Fig\.?|Table)\s*', '', fig_ref, flags=re.IGNORECASE).strip()
        
        if fig_num and hasattr(page, 'image') and page.image:
            figure_map[fig_num] = {
                "b64": page.image,
                "caption": getattr(page, 'caption', '') or '',
                "page": page.page,
                "figure_ref": getattr(page, 'figure_ref', '') or '',
            }
    
    log.info(f"Built figure map with {len(figure_map)} figures: {list(figure_map.keys())}")
    return figure_map


def assign_images_by_figure_reference(
    slides: list,
    pdf_images: dict,
    image_contexts: dict,
    figure_map: dict,
) -> tuple[dict, dict]:
    """
    Assign images to slides using figure reference matching.
    
    Args:
        slides: List of slide dicts
        pdf_images: {img_id: b64_data}
        image_contexts: {img_id: context_text}
        figure_map: {figure_number: {"b64": ..., "caption": ...}}
    
    Returns:
        (render_images, render_captions)
        render_images: {slide_idx: "data:image/jpeg;base64,..."}
        render_captions: {slide_idx: "Figure 2-8: ..."}
    """
    render_images = {}
    render_captions = {}
    used_figures = set()
    
    for i, slide in enumerate(slides):
        # Skip title slides
        slide_type = slide.get("slide_type") if isinstance(slide, dict) else getattr(slide, "slide_type", "")
        if slide_type == "title" or i == 0:
            continue
        
        # Check if LLM already assigned an image
        iid = slide.get("image_id") if isinstance(slide, dict) else getattr(slide, "image_id", None)
        if iid and iid in pdf_images:
            render_images[i] = f"data:image/jpeg;base64,{pdf_images[iid]}"
            continue
        
        # Build slide text for reference extraction
        title = slide.get("title", "") if isinstance(slide, dict) else getattr(slide, "title", "")
        bullets = slide.get("bullets", []) if isinstance(slide, dict) else getattr(slide, "bullets", [])
        
        bullet_texts = []
        source_ids = []
        for b in bullets:
            if isinstance(b, dict):
                bullet_texts.append(b.get("text", ""))
                if b.get("source_id"):
                    source_ids.append(b["source_id"])
            else:
                bullet_texts.append(str(b))
        
        slide_text = f"{title} {' '.join(bullet_texts)} {' '.join(source_ids)}"
        
        # PRIORITY 1: Find explicit figure references in slide content
        fig_refs = _extract_figure_refs_from_text(slide_text)
        
        matched_figure = None
        for ref in fig_refs:
            norm_ref = _normalize_figure_number(ref)
            if norm_ref in figure_map and norm_ref not in used_figures:
                matched_figure = norm_ref
                break
            # Try with different separator (2.8 vs 2-8)
            alt_ref = norm_ref.replace("-", ".") if "-" in norm_ref else norm_ref.replace(".", "-")
            if alt_ref in figure_map and alt_ref not in used_figures:
                matched_figure = alt_ref
                break
        
        if matched_figure:
            fig_data = figure_map[matched_figure]
            render_images[i] = f"data:image/jpeg;base64,{fig_data['b64']}"
            render_captions[i] = fig_data.get('caption', '') or fig_data.get('figure_ref', '')
            used_figures.add(matched_figure)
            log.info(f"  ✓ Slide {i+1} '{title[:30]}' matched Figure {matched_figure} (explicit reference)")
            continue
        
        # PRIORITY 2: Semantic fallback (original logic) - only if no explicit reference
        slide_words = set(re.findall(r'\b[a-z]{5,}\b', slide_text.lower()))
        best_match_id, best_score = None, 0
        
        for img_id, context in image_contexts.items():
            # Skip if we've used this image
            # Check if this img_id corresponds to an already-used figure
            already_used = False
            for fig_num, fig_data in figure_map.items():
                if fig_num in used_figures:
                    # Check if this image is the one for this figure
                    if fig_data.get('b64') == pdf_images.get(img_id):
                        already_used = True
                        break
            
            if already_used:
                continue
            
            ctx_words = set(re.findall(r'\b[a-z]{5,}\b', context.lower()))
            overlap = len(slide_words & ctx_words)
            
            # Require stronger match for semantic fallback (avoid wrong matches)
            if overlap > best_score and overlap >= 4:  # Increased threshold from 3 to 4
                best_score, best_match_id = overlap, img_id
        
        if best_match_id:
            render_images[i] = f"data:image/jpeg;base64,{pdf_images[best_match_id]}"
            log.info(f"  ~ Slide {i+1} '{title[:30]}' semantic match: {best_match_id} (score: {best_score})")
    
    return render_images, render_captions


def assign_fallback_images_v2(
    slides: list,
    pages: list,
    pdf_images: dict,
    image_contexts: dict,
) -> tuple[dict, dict]:
    """
    Main entry point: Build figure map and assign images.
    
    Returns: (render_images, render_captions)
    """
    # Build figure map from pages
    figure_map = build_figure_to_image_map(pages)
    
    # Assign images
    return assign_images_by_figure_reference(
        slides=slides,
        pdf_images=pdf_images,
        image_contexts=image_contexts,
        figure_map=figure_map,
    )


# ══════════════════════════════════════════════════════════════════════════════
# SECTION ORDER EXTRACTION
# ══════════════════════════════════════════════════════════════════════════════



# ══════════════════════════════════════════════════════════════════════════════
# TEST
# ══════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    # Test figure reference extraction
    test_texts = [
        "as shown in Figure 2-8",
        "See Fig. 3.1 for details",
        "Compare with Table 1",
        "The results (Figure 2-7, Figure 2-8) show...",
        "k-neighbors regression uses data points",  # No figure ref
    ]
    
    print("── Figure Reference Extraction Test ──")
    for text in test_texts:
        refs = _extract_figure_refs_from_text(text)
        print(f"  '{text[:40]}...' -> {refs}")


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
    img_page_map = {}  # IMG_001 → page number
    for img_id, page in zip(list(pdf_images.keys()), pdf_img_pages):
        ref = getattr(page, 'figure_ref', '') or ''
        if ref:
            key = ref.lower().strip().rstrip('.:')
            figure_ref_map[key] = img_id
            num_match = re.search(r'[\d]+[-\.][\d]+', key)
            if num_match:
                figure_ref_map[f"figure {num_match.group(0)}"] = img_id
                figure_ref_map[f"fig. {num_match.group(0)}"] = img_id
        img_page_map[img_id] = getattr(page, 'page', 0)

    return pdf_images, list(pdf_images.keys()), image_contexts, image_captions, figure_ref_map, img_page_map

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
        
        # Skip title and summary slides entirely
        slide_type = slide.get("slide_type") if isinstance(slide, dict) else getattr(slide, "slide_type", "")
        if slide_type in ("title", "summary") or i == 0 or i == len(slides) - 1:
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
        
        # Priority match: ALL figure references mentioned in slide text
        fig_mentioned = False
        if figure_ref_map:
            all_fig_matches = re.findall(
                r'figure\s+([\d]+[-\.][\d]+(?:[-\.][\d]+)*)|fig\.\s*([\d]+[-\.][\d]+(?:[-\.][\d]+)*)',
                slide_text, re.IGNORECASE
            )
            matched_imgs = []
            for m in all_fig_matches:
                fig_num = (m[0] or m[1] or "").strip()
                ref_key = f"figure {fig_num}".lower()
                if ref_key in figure_ref_map and figure_ref_map[ref_key] not in used_images:
                    img_id = figure_ref_map[ref_key]
                    matched_imgs.append(f"data:image/jpeg;base64,{pdf_images[img_id]}")
                    used_images.add(img_id)
            if matched_imgs:
                render_images[i] = matched_imgs if len(matched_imgs) > 1 else matched_imgs[0]
                fig_mentioned = True
                continue
            if all_fig_matches:
                # Figures mentioned but none found in map — skip keyword fallback
                fig_mentioned = True
                continue

        # Fallback: look up figure refs from the PDF section this slide belongs to
        if not fig_mentioned and section_fig_map:
            slide_section = slide.get("title", "") if isinstance(slide, dict) else ""
            slide_words = set(slide_section.lower().split())
            best_section_match = None
            best_overlap = 0
            for section, refs in section_fig_map.items():
                section_words = set(section.lower().replace('>', ' ').split())
                overlap = len(slide_words & section_words)
                # Require at least 3 words overlap OR exact substring match
                if overlap > best_overlap and (
                    overlap >= 3 or
                    slide_section.lower() in section.lower() or
                    section.lower().endswith(slide_section.lower())
                ):
                    best_overlap = overlap
                    best_section_match = (section, refs)

            if best_section_match:
                section, refs = best_section_match
                for ref in refs:
                    if ref in figure_ref_map and figure_ref_map[ref] not in used_images:
                        img_id = figure_ref_map[ref]
                        render_images[i] = f"data:image/jpeg;base64,{pdf_images[img_id]}"
                        used_images.add(img_id)
                        fig_mentioned = True
                        break

        # Keyword matching disabled — too many false positives
        # Only assign images when figure refs are explicitly known
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