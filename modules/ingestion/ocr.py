"""
ocr.py  —  Step 3: OCR Integration
FIX D: Pre-warm EasyOCR at import time so the first user request
       never waits for the model cold-start (saves 3–5s).
       Call warm_ocr_engine() from api.py @app.on_event("startup").
"""

from __future__ import annotations
import logging
import numpy as np
from pathlib import Path
import sys

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

try:
    from modules.ingestion.ingestion import DocumentPage
except ImportError:
    pass

from modules.core.config_loader import CONFIG

log = logging.getLogger("ocr")
if not log.hasHandlers():
    logging.basicConfig(level=logging.INFO,
                        format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
                        datefmt="%H:%M:%S")

_EASYOCR_CACHE = None


def warm_ocr_engine():
    """FIX D: Call this at server startup to pre-load EasyOCR into memory."""
    global _EASYOCR_CACHE
    if _EASYOCR_CACHE is not None:
        return
    engine_type = CONFIG["ocr"]["engine"].lower()
    if engine_type == "easyocr":
        try:
            import easyocr
            langs = CONFIG["ocr"]["languages"]
            device = CONFIG["ocr"].get("device", "cpu")  # NEW: respect device config
            log.info(f"Pre-warming EasyOCR ({langs}) on {device}...")
            _EASYOCR_CACHE = easyocr.Reader(langs, gpu=(device == "cuda"))
            log.info("  ✔ EasyOCR pre-warmed successfully.")
        except ImportError:
            log.warning("EasyOCR not installed — skipping pre-warm.")
        except Exception as e:
            log.warning(f"EasyOCR pre-warm failed (non-fatal): {e}")


class OCREngine:
    def __init__(self):
        self.engine_type = CONFIG["ocr"]["engine"].lower()
        self.languages   = CONFIG["ocr"]["languages"]
        self._reader     = None
        self._initialize()

    def _initialize(self):
        global _EASYOCR_CACHE
        if self.engine_type == "easyocr":
            try:
                if _EASYOCR_CACHE is None:
                    import easyocr
                    device = CONFIG["ocr"].get("device", "cpu")
                    _EASYOCR_CACHE = easyocr.Reader(self.languages, gpu=(device == "cuda"))
                    log.info(f"  ✔ EasyOCR loaded on {device}.")
                self._reader = _EASYOCR_CACHE
            except ImportError:
                log.error("EasyOCR not installed.")
                raise
        elif self.engine_type == "tesseract":
            try:
                import pytesseract
                self._reader = pytesseract
                log.info("  ✔ Tesseract binding loaded.")
            except ImportError:
                log.error("pytesseract not installed.")
                raise
        else:
            raise ValueError(f"Unknown OCR engine: {self.engine_type}")

    def process_image(self, pil_image) -> str:
        import base64, io
        from PIL import Image
        if isinstance(pil_image, str):
            img_data  = base64.b64decode(pil_image)
            pil_image = Image.open(io.BytesIO(img_data)).convert("RGB")
        if self.engine_type == "easyocr":
            img_np  = np.array(pil_image)
            results = self._reader.readtext(img_np, detail=0)
            return "\n".join(results)
        elif self.engine_type == "tesseract":
            lang_map  = {"fr": "fra", "en": "eng"}
            tess_lang = "+".join(lang_map.get(l, l) for l in self.languages)
            return self._reader.image_to_string(pil_image, lang=tess_lang).strip()


def run_ocr(pages: list = None, *, b64_image: str = None) -> list | str:
    """
    Run OCR on pages list OR a single base64 image.
    
    Usage:
        run_ocr(pages)              → process list of DocumentPage
        run_ocr(b64_image="...")    → process single base64 image, returns text
    """
    # Mode 1: Single base64 image
    if b64_image is not None:
        engine = OCREngine()
        result = engine.process_image(b64_image).strip()
        log.info(f"OCR on base64 image: extracted {len(result)} chars")
        return result
    
    # Mode 2: List of pages
    if pages is None:
        return []
    
    # Find pages needing OCR (both "image" and "pdf_image" types)
    needs_ocr = [p for p in pages if p.type in ("image", "pdf_image") and p.image is not None]
    
    if not needs_ocr:
        log.info("No images requiring OCR.")
        return pages
    
    log.info(f"Running OCR on {len(needs_ocr)} image(s)...")
    engine = OCREngine()
    processed = 0
    
    for page in pages:
        if page.type in ("image", "pdf_image") and page.image is not None:
            page.text = engine.process_image(page.image).strip()
            processed += 1
    
    log.info(f"OCR complete — {processed} image(s) processed.")
    return pages
