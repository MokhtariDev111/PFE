"""
modules/doc_generation — Presentation Generation Pipeline
==========================================================
LLM generation, slide building, HTML rendering, image pipeline,
pedagogical engine (sequential/parallel), and visual strategy.
"""

from modules.doc_generation.llm import LLMEngine
from modules.doc_generation.slide_generator import SlideData  # build_slides removed - unused
from modules.doc_generation.html_renderer import render as render_html
from modules.doc_generation.image_pipeline import (
    _build_image_registry as build_image_registry,
    _assign_fallback_images as assign_fallback_images,
    build_figure_to_image_map,
    assign_images_by_figure_reference,
)
from modules.doc_generation.pedagogical_engine import (
    PedagogicalEngine,
    SLIDE_ARC,
    _build_slide_prompt,
    _extract_slide_json,
    _slide_fingerprint,
    _subquery_for_slide,
    _prepare_context,
)
from modules.doc_generation.visual_strategy import (
    decide_visual, filter_slides_for_diagrams, validate_image_relevance
)

__all__ = [
    "LLMEngine",
    "SlideData",  # build_slides removed - unused
    "render_html",
    "build_image_registry", "assign_fallback_images",
    "build_figure_to_image_map", "assign_images_by_figure_reference",
    "PedagogicalEngine",
    "SLIDE_ARC", "_build_slide_prompt", "_extract_slide_json",
    "_slide_fingerprint", "_subquery_for_slide", "_prepare_context",
    "decide_visual", "filter_slides_for_diagrams", "validate_image_relevance",
]
