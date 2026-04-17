"""
history_store.py — Persistent presentation history
====================================================
Saves and loads metadata for every generated presentation.
Stored as a JSON array in outputs/presentation_history.json.
"""

import json
import logging
import threading
from datetime import datetime
from pathlib import Path
import sys

# File is at modules/core/history_store.py → go up 3 levels to reach project root
ROOT_DIR = Path(__file__).resolve().parent.parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from modules.core.config_loader import CONFIG

log = logging.getLogger("history_store")

def _history_file() -> Path:
    """Resolve the history file path from CONFIG at call time (respects APP_NAMESPACE)."""
    return ROOT_DIR / CONFIG["paths"]["outputs"] / "presentation_history.json"
_history_lock = threading.Lock()


def _load() -> list[dict]:
    hist = _history_file()
    if hist.exists():
        try:
            return json.loads(hist.read_text(encoding="utf-8"))
        except Exception:
            return []
    return []


def _save(records: list[dict]):
    hist = _history_file()
    hist.parent.mkdir(parents=True, exist_ok=True)
    hist.write_text(json.dumps(records, indent=2, ensure_ascii=False), encoding="utf-8")


def record_presentation(
    html_path: str,
    prompt: str,
    topic: str,
    num_slides: int,
    theme_name: str,
    model: str,
    slides: list = None,
    session_id: str = None
):
    """Append a presentation record to the history file."""
    p = Path(html_path) if html_path else None
    entry = {
        "id":         session_id or f'pres_{datetime.now().strftime("%Y%m%d_%H%M%S")}',
        "created_at": datetime.now().isoformat(timespec="seconds"),
        "prompt":     prompt,
        "topic":      topic,
        "num_slides": num_slides,
        "theme":      theme_name,
        "model":      model,
        "html_path":  str(p) if p else "",
        "slides":     slides or [],
    }
    with _history_lock:
        records = _load()
        records.insert(0, entry)   # newest first
        _save(records)
    log.info(f"History updated: {entry['topic']}")
    return entry


def load_history() -> list[dict]:
    """Return all past presentation records, newest first."""
    with _history_lock:
        return _load()


def clear_history():
    """Delete all presentation history and the underlying JSON file."""
    with _history_lock:
        hist = _history_file()
        if hist.exists():
            hist.unlink()
    log.info("History cleared.")
