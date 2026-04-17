"""
rag_retriever.py — Isolated RAG pipeline for the AI Debate Partner
===================================================================
Each conversation gets its own FAISS index stored at:
    data/debate_indexes/{conversation_id}/

This is completely separate from the presentation generator's index at
data/processed/faiss_index — no shared state, no risk of conflict.

Reuses (read-only):
  - modules/ingestion/ingestion.py       → PDF parsing
  - modules/ingestion/text_processing.py → chunking
  - modules/retrieval/embeddings.py      → build_vector_db
  - modules/retrieval/retrieval.py       → Retriever (hybrid search)
"""

import logging
import tempfile
from pathlib import Path

log = logging.getLogger("debate.rag")

# Base directory for all debate indexes — stored under the aria subproject folder
DEBATE_INDEX_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "aria" / "debate_indexes"
DEBATE_INDEX_DIR.mkdir(parents=True, exist_ok=True)


def _index_path(conversation_id: str) -> Path:
    """Return the FAISS index path for a given conversation (does NOT create directories)."""
    return DEBATE_INDEX_DIR / conversation_id / "index"


def _ensure_index_dir(conversation_id: str) -> Path:
    """Return the FAISS index path, creating parent directories if needed."""
    p = _index_path(conversation_id)
    p.parent.mkdir(parents=True, exist_ok=True)
    return p


def index_exists(conversation_id: str) -> bool:
    """Check if a FAISS index already exists for this conversation."""
    idx = _index_path(conversation_id)
    return idx.with_suffix(".index").exists() and idx.with_suffix(".json").exists()


async def build_index_from_bytes(conversation_id: str, filename: str, file_bytes: bytes) -> int:
    """
    Ingest a PDF (as raw bytes) and build an isolated FAISS index.
    Returns the number of chunks indexed.
    Runs CPU-bound work in a thread to avoid blocking the event loop.
    """
    import asyncio

    def _sync_build():
        from modules.ingestion.ingestion import ingest_directory
        from modules.ingestion.text_processing import process_pages
        from modules.retrieval.embeddings import build_vector_db

        # Write file to a temp directory
        with tempfile.TemporaryDirectory(prefix="debate_ingest_") as tmp:
            tmp_path = Path(tmp)
            safe_name = Path(filename).name.replace("..", "")
            (tmp_path / safe_name).write_bytes(file_bytes)

            # Ingest — text only, no OCR (faster, sufficient for debate context)
            pages = ingest_directory(tmp_path)
            text_pages = [p for p in pages if p.type != "pdf_image"]

            if not text_pages:
                log.warning(f"No text pages found in '{filename}'")
                return 0

            chunks = process_pages(text_pages)
            if not chunks:
                log.warning(f"No chunks produced from '{filename}'")
                return 0

            index_path = _ensure_index_dir(conversation_id)
            build_vector_db(chunks, index_path=index_path)
            log.info(f"Built debate index for '{conversation_id}': {len(chunks)} chunks from '{filename}'")
            return len(chunks)

    return await asyncio.to_thread(_sync_build)


def retrieve(conversation_id: str, query: str, top_k: int = 5) -> str:
    """
    Search the conversation's FAISS index and return a context string.
    Returns empty string if no index exists.
    """
    if not index_exists(conversation_id):
        return ""

    try:
        from modules.retrieval.retrieval import Retriever
        retriever = Retriever(index_path=_index_path(conversation_id))
        results = retriever.search(query, top_k=top_k)
        if not results:
            return ""
        context = "\n\n".join(
            f"[Page {getattr(c, 'page', '?')}] {c.text.strip()}"
            for c in results
        )
        log.info(f"RAG: retrieved {len(results)} chunks for query '{query[:50]}'")
        return context
    except Exception as e:
        log.error(f"RAG retrieval failed: {e}")
        return ""


def delete_index(conversation_id: str):
    """Delete the FAISS index for a conversation (called on conversation delete)."""
    import shutil
    idx_dir = DEBATE_INDEX_DIR / conversation_id
    if idx_dir.exists():
        shutil.rmtree(idx_dir)
        log.info(f"Deleted debate index for '{conversation_id}'")


# ─── PDF storage (for thumbnail generation) ──────────────────────────────────

def _pdf_path(conversation_id: str) -> Path:
    return DEBATE_INDEX_DIR / conversation_id / "source.pdf"


def save_pdf(conversation_id: str, pdf_bytes: bytes):
    """Save the original PDF bytes for later thumbnail rendering."""
    p = _pdf_path(conversation_id)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(pdf_bytes)


def _thumb_path(conversation_id: str, page: int) -> Path:
    p = DEBATE_INDEX_DIR / conversation_id / "thumbs"
    p.mkdir(parents=True, exist_ok=True)
    return p / f"page_{page}.png"


def get_or_render_thumbnail(conversation_id: str, page: int) -> Path | None:
    """
    Return path to a thumbnail for the given page (1-indexed).
    Renders it lazily on first request using the stored PDF.
    Returns None if PDF not found or render fails.
    """
    cached = _thumb_path(conversation_id, page)
    if cached.exists():
        return cached

    pdf = _pdf_path(conversation_id)
    if not pdf.exists():
        log.warning(f"No stored PDF for conversation '{conversation_id}'")
        return None

    try:
        import fitz
        doc = fitz.open(str(pdf))
        if page < 1 or page > len(doc):
            log.warning(f"Page {page} out of range (doc has {len(doc)} pages)")
            return None
        pg  = doc[page - 1]
        mat = fitz.Matrix(200 / 72, 200 / 72)   # 200 DPI — balanced quality/speed
        pix = pg.get_pixmap(matrix=mat, alpha=False)
        pix.save(str(cached))
        log.info(f"Thumbnail rendered: conv={conversation_id} page={page}")
        return cached
    except Exception as e:
        log.error(f"Thumbnail render failed: {e}")
        return None
