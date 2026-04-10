"""
modules/ingestion — Document Ingestion Pipeline
================================================
PDF/image ingestion, OCR, and text chunking.
"""

from modules.ingestion.ingestion import ingest_directory
from modules.ingestion.ocr import run_ocr, warm_ocr_engine
from modules.ingestion.text_processing import process_pages, TextChunk

__all__ = [
    "ingest_directory",
    "run_ocr", "warm_ocr_engine",
    "process_pages", "TextChunk",
]
