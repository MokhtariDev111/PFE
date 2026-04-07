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

def extract_section_outline(chunks: list) -> list[str]:
    """
    Extract ordered unique section headings from chunks.
    Used to generate slides in the same order as the PDF.
    """
    seen = set()
    sections = []
    
    for chunk in chunks:
        heading = getattr(chunk, 'section_heading', '') or ''
        if not heading:
            continue
        
        # Extract sub-section (after " > ")
        if " > " in heading:
            sub = heading.split(" > ", 1)[-1].strip()
        else:
            sub = heading
        
        if sub and sub not in seen:
            seen.add(sub)
            sections.append(sub)
    
    log.info(f"Extracted {len(sections)} sections from chunks")
    return sections


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
