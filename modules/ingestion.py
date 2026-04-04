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


def load_pdf(path: Path) -> list[DocumentPage]:
    doc = fitz.open(str(path))
    pages = []

    try:
        for i in range(len(doc)):
            page = doc[i]

            # 1. Extract text
            text = page.get_text("text").strip()
            pages.append(
                DocumentPage(source=path.name, page=i + 1, type="pdf", text=text)
            )

            # 2. Detect large diagrams (full-page diagrams with little text)
            drawings = page.get_drawings()
            if len(text) < 500 and len(drawings) > 2:
                try:
                    pix = page.get_pixmap(dpi=120)
                    img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
                    
                    # Try to extract figure caption from text
                    caption = _extract_figure_caption(text)
                    
                    pages.append(
                        DocumentPage(
                            source=f"{path.name} (Full Page {i+1} Diagram)",
                            page=i + 1,
                            type="pdf_image",
                            image=_pil_to_base64(img),
                            caption=caption
                        )
                    )
                except Exception as e:
                    log.warning(f"Failed to extract Page {i+1} diagram from {path.name}: {e}")

            # 3. Extract first embedded raster image per page
            img_list = page.get_images(full=True)
            if img_list:
                xref = img_list[0][0]
                base_img = doc.extract_image(xref)
                if base_img:
                    try:
                        pil_img = Image.open(io.BytesIO(base_img["image"])).convert("RGB")
                        # Skip tiny images
                        if pil_img.width >= 100 and pil_img.height >= 100:
                            b64_img = _pil_to_base64(pil_img)
                            
                            # Try to extract figure caption from page text
                            caption = _extract_figure_caption(text)
                            
                            pages.append(
                                DocumentPage(
                                    source=f"{path.name} (page {i+1} img)",
                                    page=i + 1,
                                    type="pdf_image",
                                    image=b64_img,
                                    caption=caption
                                )
                            )
                    except Exception as e:
                        log.warning(f"Failed to load image on page {i+1}: {e}")

    finally:
        doc.close()

    # Logging
    img_count = sum(1 for p in pages if p.type == "pdf_image")
    txt_count = sum(1 for p in pages if p.type == "pdf")
    log.info(f"[PDF] {path.name} → {txt_count} text pg(s), {img_count} embedded img(s)")

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
