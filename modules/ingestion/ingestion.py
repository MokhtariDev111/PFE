"""
ingestion.py  —  v3: Better Figure Reference Extraction
========================================================
FIXES:
1. Each image stores its own figure_ref (e.g., "Figure 2-7") extracted from its caption
2. Images NO LONGER inherit section_heading from the page (causes wrong matches)
3. New field: figure_number for normalized matching (e.g., "2-7", "2.8")

This allows the image assignment logic to match:
- Slide text: "as shown in Figure 2-8"
- Image: figure_ref="Figure 2-8" ✓

Instead of wrong matching:
- Slide title: "k-neighbors regression" 
- Image: section_heading="k-neighbors regression" but figure_ref="Figure 2-7" ✗
"""

from pathlib import Path
from dataclasses import dataclass, field
import fitz          # PyMuPDF
from PIL import Image
import base64
import io
import logging
import re

log = logging.getLogger("ingestion")
if not log.hasHandlers():
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s — %(message)s", datefmt="%H:%M:%S")

PDF_EXT   = {".pdf"}
DOCX_EXT  = {".docx"}
IMAGE_EXT = {".png", ".jpg", ".jpeg", ".bmp", ".tiff", ".tif", ".webp"}
TXT_EXT   = {".txt"}


@dataclass
class DocumentPage:
    source: str
    page:   int          # 1-based for PDFs, 0 for images/txt
    type:   str          # "pdf" | "image" | "txt" | "pdf_image"
    text:   str = ""     # empty for images → filled by OCR (Step 3)
    image:  object = field(default=None, repr=False)
    caption: str = ""           # Full caption text
    figure_ref: str = ""        # Normalized figure reference e.g. "Figure 2-22"
    figure_number: str = ""     # Just the number part for matching e.g. "2-22"
    section_heading: str = ""   # Nearest parent heading (for TEXT pages only)


def load_txt(path: Path) -> list[DocumentPage]:
    """Reads a plain text file with basic heuristic heading detection."""
    with open(path, "r", encoding="utf-8", errors="replace") as f:
        text = f.read().strip()
        
    blocks = re.split(r'\n\s*\n', text)
    pages = []
    current_h1 = ""
    current_text_blocks = []
    
    for block in blocks:
        block = block.strip()
        if not block:
            continue
            
        lines = block.split('\n')
        if len(lines) == 1:
            line = lines[0]
            if len(line) < 80 and not line.endswith(('.', ',', ';', ':')):
                is_heading = line.istitle() or line.isupper()
                if re.match(r'^[\d\.]*\s*[A-Z]', line) and len(line) < 60:
                    is_heading = True
                
                if is_heading:
                    if current_text_blocks:
                        pages.append(DocumentPage(
                            source=path.name,
                            page=len(pages) + 1,
                            type="txt",
                            text="\n\n".join(current_text_blocks),
                            section_heading=current_h1
                        ))
                        current_text_blocks = []
                    current_h1 = line
                    continue
                    
        current_text_blocks.append(block)
        
    if current_text_blocks:
        pages.append(DocumentPage(
            source=path.name,
            page=len(pages) + 1,
            type="txt",
            text="\n\n".join(current_text_blocks),
            section_heading=current_h1
        ))

    log.info(f"[TXT] {path.name} → {len(pages)} semantic parts")
    return pages

def load_docx(path: Path) -> list[DocumentPage]:
    """
    Reads a docx file using python-docx.
    Extracts text and uses paragraph styles for headings.
    """
    try:
        import docx
    except ImportError:
        log.error("python-docx is not installed. Please pip install python-docx")
        return []

    doc = docx.Document(path)
    pages = []
    
    current_h1 = ""
    current_h2 = ""
    current_text_blocks = []
    
    for para in doc.paragraphs:
        style_name = para.style.name.lower() if para.style else ""
        text = para.text.strip()
        if not text:
            continue
            
        if "heading 1" in style_name or "title" in style_name:
            if current_text_blocks:
                sec_head = f"{current_h1} > {current_h2}" if current_h1 and current_h2 else current_h2 or current_h1
                pages.append(DocumentPage(
                    source=path.name,
                    page=len(pages) + 1,
                    type="docx",
                    text="\n\n".join(current_text_blocks),
                    section_heading=sec_head
                ))
                current_text_blocks = []
            current_h1 = text
            current_h2 = ""
        elif "heading 2" in style_name or "heading 3" in style_name:
            if current_text_blocks:
                sec_head = f"{current_h1} > {current_h2}" if current_h1 and current_h2 else current_h2 or current_h1
                pages.append(DocumentPage(
                    source=path.name,
                    page=len(pages) + 1,
                    type="docx",
                    text="\n\n".join(current_text_blocks),
                    section_heading=sec_head
                ))
                current_text_blocks = []
            current_h2 = text
        else:
            current_text_blocks.append(text)
            
    if current_text_blocks:
        sec_head = f"{current_h1} > {current_h2}" if current_h1 and current_h2 else current_h2 or current_h1
        pages.append(DocumentPage(
            source=path.name,
            page=len(pages) + 1,
            type="docx",
            text="\n\n".join(current_text_blocks),
            section_heading=sec_head
        ))
        
    log.info(f"[DOCX] {path.name} → {len(pages)} semantic parts")
    return pages


def _pil_to_base64(img: Image.Image) -> str:
    buffered = io.BytesIO()
    img.save(buffered, format="JPEG")
    return base64.b64encode(buffered.getvalue()).decode("utf-8")


# ── Heading detection thresholds ──────────────────────────────────────────────
_H1_SIZE = 13.0   # chapter-level
_H2_SIZE = 10.5   # section-level (lowered to catch more headings in dense books)
_BODY_MAX = 10.4  # body text


def _extract_headings_from_page(page_dict: dict) -> list[tuple[float, str]]:
    """
    Return list of (font_size, heading_text) for headings on this page.

    Detection strategy:
      1. Font size >= _H2_SIZE (11.0)  → heading (original logic)
      2. Bold text with size >= 10.0   → heading (catches academic PDFs that
         use bold rather than larger font for section titles)
    """
    headings = []
    for block in page_dict.get("blocks", []):
        if block.get("type") != 0:
            continue
        for line in block.get("lines", []):
            line_text_parts = []
            max_size = 0.0
            is_bold = False
            for span in line.get("spans", []):
                sz = span.get("size", 0)
                t  = span.get("text", "").strip()
                flags = span.get("flags", 0)
                if not t:
                    continue
                max_size = max(max_size, sz)
                # PyMuPDF: bit 4 of flags = bold (value 16)
                if flags & (1 << 4):
                    is_bold = True
                line_text_parts.append(t)
            line_text = " ".join(line_text_parts).strip()

            # Accept as heading if font is large enough OR if bold with decent size
            is_heading = (max_size >= _H2_SIZE) or (is_bold and max_size >= 10.0)

            if is_heading and line_text and 3 < len(line_text) <= 80:
                if not line_text.replace("|", "").replace(" ", "").isdigit():
                    headings.append((max_size, line_text))
    return headings


def _page_plain_text(page_dict: dict) -> str:
    """Reconstruct plain text from a page dict."""
    lines = []
    for block in page_dict.get("blocks", []):
        if block.get("type") != 0:
            continue
        block_lines = []
        for line in block.get("lines", []):
            parts = [sp.get("text", "") for sp in line.get("spans", [])]
            block_lines.append("".join(parts))
        lines.append("\n".join(block_lines))
    return "\n\n".join(lines).strip()


def _extract_figure_caption(text: str, page_num: int = 0) -> str:
    """
    Extract figure/table caption from page text.
    Returns the full caption line.
    """
    if not text:
        return ""
    
    patterns = [
        r'(Figure\s+\d+[-.\d]*[.:]\s*[^\n]+)',
        r'(Fig\.\s*\d+[-.\d]*[.:]\s*[^\n]+)',
        r'(Table\s+\d+[-.\d]*[.:]\s*[^\n]+)',
        r'(Diagram\s+\d+[-.\d]*[.:]\s*[^\n]+)',
        r'(Chart\s+\d+[-.\d]*[.:]\s*[^\n]+)',
    ]
    
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            caption = match.group(1).strip()
            if len(caption) > 150:
                caption = caption[:147] + "..."
            return caption
    
    return ""


def _extract_figure_ref(caption: str) -> str:
    """Extract normalized figure reference like 'Figure 2-22' from caption."""
    if not caption:
        return ""
    m = re.match(r'(Figure\s+[\d][-.\d]*|Fig\.\s*[\d][-.\d]*|Table\s+[\d][-.\d]*)', caption, re.IGNORECASE)
    return m.group(1).strip() if m else ""


def _extract_figure_number(figure_ref: str) -> str:
    """
    Extract just the number part for easier matching.
    'Figure 2-22' -> '2-22'
    'Fig. 3.5' -> '3.5'
    'Table 1' -> '1'
    """
    if not figure_ref:
        return ""
    # Remove prefix and normalize
    num = re.sub(r'^(Figure|Fig\.?|Table|Diagram|Chart)\s*', '', figure_ref, flags=re.IGNORECASE)
    return num.strip()


def _find_all_figure_references_in_text(text: str) -> list[str]:
    """
    Find ALL figure references mentioned in text (not just captions).
    Returns list of figure numbers like ['2-7', '2-8', '3-1'].
    
    This is used to:
    1. Know which figures are actually referenced in each section
    2. Match slide content to the correct figure
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
    
    # Deduplicate while preserving order
    seen = set()
    unique = []
    for r in refs:
        if r not in seen:
            seen.add(r)
            unique.append(r)
    
    return unique


def load_pdf(path: Path) -> list[DocumentPage]:
    """
    Load a PDF and return DocumentPage objects.
    
    v3 FIX: Images get their own figure_ref from their caption,
    NOT the section_heading of the page (which caused mismatches).
    """
    doc = fitz.open(str(path))
    pages = []
    total_pages = len(doc)

    # Skip preliminary pages
    skip_count = max(2, min(6, int(total_pages * 0.08)))

    # Running state for TEXT pages
    current_h1 = ""
    current_h2 = ""

    try:
        for i in range(len(doc)):
            page = doc[i]
            page_dict = page.get_text("dict")

            # Detect headings
            for size, heading_text in _extract_headings_from_page(page_dict):
                if size >= _H1_SIZE:
                    current_h1 = heading_text
                    current_h2 = ""
                elif size >= _H2_SIZE:
                    current_h2 = heading_text

            # Section label for TEXT pages
            if current_h1 and current_h2:
                section_label = f"{current_h1} > {current_h2}"
            elif current_h2:
                section_label = current_h2
            else:
                section_label = current_h1

            # Plain text
            text = _page_plain_text(page_dict)
            
            # Find all figure references in text (for context)
            figure_refs_in_text = _find_all_figure_references_in_text(text)

            # Add TEXT page (with section_heading)
            pages.append(
                DocumentPage(
                    source=path.name,
                    page=i + 1,
                    type="pdf",
                    text=text,
                    section_heading=section_label,
                )
            )

            # Skip image extraction for preliminary pages
            if i < skip_count:
                continue

            # ── Full-page diagrams ───────────────────────────────────────────
            drawings = page.get_drawings()
            if len(text) < 500 and len(drawings) > 2:
                try:
                    pix = page.get_pixmap(dpi=120)
                    img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
                    caption = _extract_figure_caption(text, i + 1)
                    fig_ref = _extract_figure_ref(caption)
                    fig_num = _extract_figure_number(fig_ref)
                    
                    pages.append(
                        DocumentPage(
                            source=f"{path.name} (Full Page {i+1} Diagram)",
                            page=i + 1,
                            type="pdf_image",
                            image=_pil_to_base64(img),
                            caption=caption,
                            figure_ref=fig_ref,
                            figure_number=fig_num,
                            # NOTE: No section_heading for images!
                            section_heading="",  
                        )
                    )
                except Exception as e:
                    log.warning(f"Failed to extract Page {i+1} diagram: {e}")

            # ── Embedded raster images ───────────────────────────────────────
            img_list = page.get_images(full=True)
            if img_list:
                xref = img_list[0][0]
                base_img = doc.extract_image(xref)
                if base_img:
                    try:
                        pil_img = Image.open(io.BytesIO(base_img["image"])).convert("RGB")
                        if pil_img.width >= 150 and pil_img.height >= 150:
                            b64_img = _pil_to_base64(pil_img)
                            caption = _extract_figure_caption(text, i + 1)
                            fig_ref = _extract_figure_ref(caption)
                            fig_num = _extract_figure_number(fig_ref)
                            
                            pages.append(
                                DocumentPage(
                                    source=f"{path.name} (page {i+1} img)",
                                    page=i + 1,
                                    type="pdf_image",
                                    image=b64_img,
                                    caption=caption,
                                    figure_ref=fig_ref,
                                    figure_number=fig_num,
                                    # NOTE: No section_heading for images!
                                    section_heading="",
                                )
                            )
                    except Exception as e:
                        log.warning(f"Failed to load image on page {i+1}: {e}")

    finally:
        doc.close()

    # Logging
    img_count  = sum(1 for p in pages if p.type == "pdf_image")
    txt_count  = sum(1 for p in pages if p.type == "pdf")
    fig_count  = sum(1 for p in pages if p.figure_ref)
    log.info(
        f"[PDF] {path.name} → {txt_count} text pg(s), {img_count} img(s), "
        f"{fig_count} with figure_ref, skipped first {skip_count} for images"
    )
    return pages


def load_image(path: Path) -> DocumentPage:
    img = Image.open(path).convert("RGB")
    b64_img = _pil_to_base64(img)
    log.info(f"[IMG] {path.name}  →  {img.size[0]}×{img.size[1]} px")
    return DocumentPage(source=path.name, page=0, type="image", image=b64_img)


def ingest_directory(raw_dir: str | Path) -> list[DocumentPage]:
    raw_dir = Path(raw_dir)
    results = []
    
    if not raw_dir.exists():
        log.warning(f"Raw directory '{raw_dir}' does not exist.")
        return results

    files = sorted([f for f in raw_dir.iterdir() if f.is_file() and f.name != ".gitkeep"])
    log.info(f"Ingesting {len(files)} file(s) from '{raw_dir}' …")
    
    for f in files:
        ext = f.suffix.lower()
        if ext in PDF_EXT:
            results.extend(load_pdf(f))
        elif ext in DOCX_EXT:
            results.extend(load_docx(f))
        elif ext in IMAGE_EXT:
            results.append(load_image(f))
        elif ext in TXT_EXT:
            results.extend(load_txt(f))
            
    log.info(f"Total pages/images loaded: {len(results)}")
    return results


# ══════════════════════════════════════════════════════════════════════════════
# HELPER: Get content by type (for enrichment pipeline)
# ══════════════════════════════════════════════════════════════════════════════

def get_content_by_type(pages: list[DocumentPage], content_type: str) -> list[DocumentPage]:
    """
    Filter pages by content_type.
    content_type: 'text' | 'image' | 'table' | 'code'
    """
    type_map = {
        'text': lambda p: p.type in ('pdf', 'txt'),
        'image': lambda p: p.type in ('pdf_image', 'image'),
        'table': lambda p: getattr(p, 'content_type', None) == 'table',
        'code': lambda p: getattr(p, 'content_type', None) == 'code',
    }
    
    filter_fn = type_map.get(content_type, lambda p: False)
    return [p for p in pages if filter_fn(p)]


# ══════════════════════════════════════════════════════════════════════════════
# HELPER: Build figure reference index
# ══════════════════════════════════════════════════════════════════════════════

def build_figure_index(pages: list[DocumentPage]) -> dict:
    """
    Build an index mapping figure numbers to image data.
    
    Returns: {
        "2-7": {"image_id": "IMG_001", "caption": "...", "page": 5},
        "2-8": {"image_id": "IMG_002", "caption": "...", "page": 5},
        ...
    }
    """
    figure_index = {}
    img_counter = 0
    
    for page in pages:
        if page.type == "pdf_image" and page.figure_number:
            img_counter += 1
            img_id = f"IMG_{img_counter:03d}"
            figure_index[page.figure_number] = {
                "image_id": img_id,
                "caption": page.caption,
                "figure_ref": page.figure_ref,
                "page": page.page,
            }
    
    return figure_index


# ── Quick run ─────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import sys
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from modules.core.config_loader import CONFIG

    pages = ingest_directory(CONFIG["paths"]["data_raw"])
    
    print("\n── Figure Reference Summary ──")
    for p in pages:
        if p.type == "pdf_image" and p.figure_ref:
            print(f"  Page {p.page}: {p.figure_ref} (number: {p.figure_number})")
    
    print(f"\n── Building Figure Index ──")
    fig_index = build_figure_index(pages)
    for fig_num, info in fig_index.items():
        print(f"  {fig_num}: {info['image_id']} - {info['caption'][:50]}...")