"""
ingestion.py  —  Step 2: Data Ingestion
Loads PDFs (text) and images from data/raw/.
Produces a list of DocumentPage dicts for downstream steps.
"""

from pathlib import Path
from dataclasses import dataclass, field
import fitz          # PyMuPDF
from PIL import Image
import base64
import io
import logging

log = logging.getLogger("ingestion")
if not log.hasHandlers():
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s — %(message)s", datefmt="%H:%M:%S")

PDF_EXT   = {".pdf"}
IMAGE_EXT = {".png", ".jpg", ".jpeg", ".bmp", ".tiff", ".tif", ".webp"}
TXT_EXT   = {".txt"}


@dataclass
class DocumentPage:
    source: str
    page:   int          # 1-based for PDFs, 0 for images/txt
    type:   str          # "pdf" | "image" | "txt"
    text:   str = ""     # empty for images → filled by OCR (Step 3)
    image:  object = field(default=None, repr=False)
    caption: str = ""    # Figure caption
    section_heading: str = ""   # Nearest parent heading detected from font size (Bug A fix)


def load_txt(path: Path) -> DocumentPage:
    """Reads a plain text file."""
    with open(path, "r", encoding="utf-8", errors="replace") as f:
        text = f.read().strip()
    log.info(f"[TXT] {path.name}  →  {len(text)} chars")
    return DocumentPage(source=path.name, page=0, type="txt", text=text)


def _pil_to_base64(img: Image.Image) -> str:
    buffered = io.BytesIO()
    img.save(buffered, format="JPEG")
    return base64.b64encode(buffered.getvalue()).decode("utf-8")



# ── Heading detection thresholds (Bug A fix) ──────────────────────────────────
# Derived from font-size survey of this book and generalised for most PDFs.
# Anything >= H1_SIZE is a chapter title, >= H2_SIZE is a section heading.
# Body text in this book is 10.5pt; we pick thresholds safely above that.
_H1_SIZE = 14.0   # chapter-level  (e.g. "Ensembles of Decision Trees" 15.8pt)
_H2_SIZE = 11.0   # section-level  (e.g. "Building decision trees" 11.6pt)
_BODY_MAX = 10.9  # anything at or below this is body / caption / footer


def _extract_headings_from_page(page_dict: dict) -> list[tuple[float, str]]:
    """
    Return list of (font_size, heading_text) for every span on this page
    whose font size is above _H2_SIZE.  Results are in reading order.
    """
    headings = []
    for block in page_dict.get("blocks", []):
        if block.get("type") != 0:       # 0 = text block
            continue
        for line in block.get("lines", []):
            line_text_parts = []
            max_size = 0.0
            for span in line.get("spans", []):
                sz = span.get("size", 0)
                t  = span.get("text", "").strip()
                if not t:
                    continue
                max_size = max(max_size, sz)
                line_text_parts.append(t)
            line_text = " ".join(line_text_parts).strip()
            # Accept as heading only if large enough and not a page-number/footer
            # Also cap length: real headings are short; long lines are body text
            if max_size >= _H2_SIZE and line_text and 3 < len(line_text) <= 80:
                # Reject obvious page numbers / footer lines (short all-numeric)
                if not line_text.replace("|", "").replace(" ", "").isdigit():
                    headings.append((max_size, line_text))
    return headings


def _page_plain_text(page_dict: dict) -> str:
    """Reconstruct plain text from a page dict (preserves paragraph breaks)."""
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


def load_pdf(path: Path) -> list[DocumentPage]:
    """
    Load a PDF and return DocumentPage objects.
    Bug A fix: uses get_text("dict") to detect headings by font size.
    Each page's section_heading is set to the most recent h1/h2 seen so far,
    so every chunk knows which section of the document it belongs to.
    """
    doc = fitz.open(str(path))
    pages = []
    total_pages = len(doc)

    # Skip preliminary pages (covers, TOC, preface)
    skip_count = max(2, min(6, int(total_pages * 0.08)))

    # Running state: track the current section as we walk through pages
    current_h1 = ""   # chapter-level heading
    current_h2 = ""   # section-level heading

    try:
        for i in range(len(doc)):
            page = doc[i]

            # ── 1. Extract structured page dict (font sizes + text) ──────────
            page_dict = page.get_text("dict")

            # ── 2. Detect any new headings on this page ──────────────────────
            for size, heading_text in _extract_headings_from_page(page_dict):
                if size >= _H1_SIZE:
                    current_h1 = heading_text
                    current_h2 = ""          # reset sub-heading on new chapter
                    log.debug(f"  H1 on p{i+1}: {heading_text!r}")
                elif size >= _H2_SIZE:
                    current_h2 = heading_text
                    log.debug(f"  H2 on p{i+1}: {heading_text!r}")

            # Build the section label that will tag every chunk from this page.
            # Format: "Chapter > Section" or just "Section" or just "Chapter"
            if current_h1 and current_h2:
                section_label = f"{current_h1} > {current_h2}"
            elif current_h2:
                section_label = current_h2
            else:
                section_label = current_h1

            # ── 3. Reconstruct plain text ────────────────────────────────────
            text = _page_plain_text(page_dict)

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

            # ── 4. Detect full-page diagrams (little text + many drawings) ───
            drawings = page.get_drawings()
            if len(text) < 500 and len(drawings) > 2:
                try:
                    pix = page.get_pixmap(dpi=120)
                    img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
                    caption = _extract_figure_caption(text)
                    pages.append(
                        DocumentPage(
                            source=f"{path.name} (Full Page {i+1} Diagram)",
                            page=i + 1,
                            type="pdf_image",
                            image=_pil_to_base64(img),
                            caption=caption,
                            section_heading=section_label,   # inherit section
                        )
                    )
                except Exception as e:
                    log.warning(f"Failed to extract Page {i+1} diagram from {path.name}: {e}")

            # ── 5. Extract first embedded raster image per page ──────────────
            img_list = page.get_images(full=True)
            if img_list:
                xref = img_list[0][0]
                base_img = doc.extract_image(xref)
                if base_img:
                    try:
                        pil_img = Image.open(io.BytesIO(base_img["image"])).convert("RGB")
                        if pil_img.width >= 150 and pil_img.height >= 150:
                            b64_img = _pil_to_base64(pil_img)
                            caption = _extract_figure_caption(text)
                            pages.append(
                                DocumentPage(
                                    source=f"{path.name} (page {i+1} img)",
                                    page=i + 1,
                                    type="pdf_image",
                                    image=b64_img,
                                    caption=caption,
                                    section_heading=section_label,  # inherit section
                                )
                            )
                    except Exception as e:
                        log.warning(f"Failed to load image on page {i+1}: {e}")

    finally:
        doc.close()

    # ── Logging ───────────────────────────────────────────────────────────────
    img_count  = sum(1 for p in pages if p.type == "pdf_image")
    txt_count  = sum(1 for p in pages if p.type == "pdf")
    head_count = sum(1 for p in pages if p.section_heading)
    log.info(
        f"[PDF] {path.name} → {txt_count} text pg(s), {img_count} img(s), "
        f"{head_count} pages with section_heading, skipped first {skip_count} for images"
    )
    return pages

def _extract_figure_caption(text: str) -> str:
    """
    Extract figure/table caption from page text.
    Looks for patterns like:
      - "Figure 3-23. Description here"
      - "Fig. 5: Some caption"
      - "Table 2.1 - Data overview"
    """
    import re
    
    if not text:
        return ""
    
    # Common figure/table caption patterns
    patterns = [
        r'(Figure\s+\d+[-.\d]*[.:]\s*[^\n]+)',      # Figure 3-23. Description
        r'(Fig\.\s*\d+[-.\d]*[.:]\s*[^\n]+)',       # Fig. 5: Description
        r'(Table\s+\d+[-.\d]*[.:]\s*[^\n]+)',       # Table 2.1. Description
        r'(Diagram\s+\d+[-.\d]*[.:]\s*[^\n]+)',     # Diagram 1: Description
        r'(Chart\s+\d+[-.\d]*[.:]\s*[^\n]+)',       # Chart 3. Description
    ]
    
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            caption = match.group(1).strip()
            # Limit length
            if len(caption) > 150:
                caption = caption[:147] + "..."
            return caption
    
    return ""


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
        elif ext in IMAGE_EXT:
            results.append(load_image(f))
        elif ext in TXT_EXT:
            results.append(load_txt(f))
            
    log.info(f"Total pages/images loaded: {len(results)}")
    return results


# ── Quick run ─────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import sys
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from modules.config_loader import CONFIG

    pages = ingest_directory(CONFIG["paths"]["data_raw"])
    pdfs  = [p for p in pages if p.type == "pdf"]
    imgs  = [p for p in pages if p.type == "image"]
    empty = [p for p in pdfs  if not p.text]

    print(f"PDF pages : {len(pdfs)}")
    print(f"Images    : {len(imgs)}")
    print(f"Empty(OCR): {len(empty)}")