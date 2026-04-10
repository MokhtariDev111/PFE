"""
slide_generator.py  — v2: Supports new slide_type variety
==========================================================
Maps the enriched lesson plan (definition, concept, example,
comparison, summary) into SlideData objects.
"""

import logging
from dataclasses import dataclass, field
from pathlib import Path
import sys

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

log = logging.getLogger("slide_generator")
if not log.hasHandlers():
    logging.basicConfig(level=logging.INFO,
                        format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
                        datefmt="%H:%M:%S")

VALID_SLIDE_TYPES = {"title", "definition", "concept", "example",
                     "comparison", "summary", "content", "section"}


@dataclass
class SlideData:
    slide_type:       str
    title:            str
    bullets:          list = field(default_factory=list)
    paragraph:        str  = ""
    key_points:       list = field(default_factory=list)
    page_range:       str  = ""
    speaker_notes:    str  = ""
    key_message:      str  = ""
    visual_hint:      str  = "none"
    image_id:         str  = None
    quality_score:    int  = 8
    quality_feedback: str  = ""


# build_slides() function removed - was never used in the pipeline
# Only SlideData dataclass is needed for the batch generation path
