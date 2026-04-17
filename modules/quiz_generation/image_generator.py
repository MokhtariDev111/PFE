"""
image_generator.py — SVG-based educational diagram generator
=============================================================
Workflow:
  1. Receive image_prompt (description of the diagram needed)
  2. Ask LLM to generate a complete, self-contained SVG string
  3. Validate the SVG (must start with <svg, must have content)
  4. On failure: retry once with error feedback
  5. Return the SVG string directly (no subprocess, no file I/O needed)

Why SVG instead of matplotlib:
  - No subprocess execution — no runtime errors, no missing imports
  - Renders perfectly in the browser at any resolution
  - LLMs are good at generating SVG for educational diagrams
  - Instant — no disk I/O, no Python execution overhead
  - Crisp, clean output that looks like a real textbook diagram
"""

import asyncio
import json
import logging
import re
from pathlib import Path

from modules.doc_generation.llm import LLMEngine

log = logging.getLogger("quiz.image_generator")

# ─────────────────────────────────────────────────────────────────────────────
# PROMPTS
# ─────────────────────────────────────────────────────────────────────────────

_SVG_PROMPT = """\
You are an expert SVG diagram creator for educational content.

Create a clean, accurate, self-contained SVG diagram for this educational concept.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DIAGRAM REQUEST
  Concept     : {concept}
  Description : {image_prompt}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SVG CANVAS — fixed dimensions, everything MUST fit inside:
  width="800" height="480" viewBox="0 0 800 480"
  Safe drawing area: x=60 to x=720, y=50 to y=400
  Title zone: y=30 (centered at x=400)
  Legend zone: x=60 to x=720, y=415 to y=470 (BOTTOM, horizontal)

STRICT LAYOUT RULES — no exceptions:
  1.  <svg width="800" height="480" viewBox="0 0 800 480" xmlns="http://www.w3.org/2000/svg">
  2.  First child: <rect width="800" height="480" fill="white"/>
  3.  Title: <text x="400" y="30" text-anchor="middle" font-size="18" font-weight="bold" font-family="Arial,sans-serif" fill="#222">
  4.  ALL content (lines, shapes, text) must stay within x=60–720, y=45–405
  5.  LEGEND must be at the BOTTOM inside y=415–465, laid out HORIZONTALLY
      Example: colored rect at (60,420) + label, next item at (180,420), etc.
  6.  Axis labels: x-axis label centered at (390, 430), y-axis label rotated at (15, 225)
  7.  NO text may exceed x=720 or y=470 — shorten labels if needed
  8.  Font sizes: title=18, axis-labels=12, tick-labels=11, legend=12 — never larger
  9.  Colors: #2196F3 blue, #F44336 red, #4CAF50 green, #FF9800 orange, #9C27B0 purple
  10. Grid lines: stroke="#e0e0e0" stroke-dasharray="4,4" — only inside drawing area
  11. Axes: stroke="#555" stroke-width="1.5"
  12. For charts with data: use explicit pixel coordinates calculated from your data range
      Map data values to pixel positions — do NOT place elements at approximate positions
  13. Inline styles only — no <style> blocks, no CSS classes
  14. NO external resources, NO JavaScript

COORDINATE MAPPING GUIDE (for charts):
  Drawing area: x: 60→720 (width=660), y: 50→400 (height=350)
  For x-axis with N points: x_pixel = 60 + (i / (N-1)) * 660
  For y-axis with range [ymin, ymax]: y_pixel = 400 - ((value - ymin) / (ymax - ymin)) * 350

Return ONLY a JSON object — no markdown, no explanation:
{{
  "svg": "<complete SVG string here>"
}}"""

_SVG_RETRY_PROMPT = """\
You are an expert SVG diagram creator. Your previous SVG had this issue: {error}

Fix it and regenerate the diagram.

  Concept     : {concept}
  Description : {image_prompt}

CRITICAL FIXES REQUIRED:
  - Canvas: width="800" height="480" viewBox="0 0 800 480"
  - White background rect covering full canvas
  - ALL elements must stay within x=60–720, y=45–405
  - Legend MUST be at the bottom (y=415–465), horizontal layout
  - NO text or shapes outside the viewBox
  - Axis labels inside bounds: x-label at y=430, y-label rotated at x=15

Return ONLY a JSON object:
{{
  "svg": "<complete corrected SVG string>"
}}"""


# ─────────────────────────────────────────────────────────────────────────────
# IMAGE GENERATOR
# ─────────────────────────────────────────────────────────────────────────────

class QuizImageGenerator:
    """
    Generates educational diagram SVGs using the LLM.
    Returns SVG strings directly — no subprocess, no file I/O.

    Usage:
        gen = QuizImageGenerator()
        svg = await gen.generate_image(
            image_prompt="line chart showing training vs validation loss illustrating overfitting",
            concept="Overfitting"
        )
        # svg → "<svg width='800' height='500'>...</svg>"
    """

    def __init__(self, llm_engine: LLMEngine = None, namespace: str = "quiz"):
        self.llm = llm_engine or LLMEngine(namespace=namespace)

    async def generate_image(
        self,
        image_prompt: str,
        concept: str = "",
        output_filename: str = None,  # kept for API compatibility, unused
    ) -> str:
        """
        Generate an educational SVG diagram.
        Returns the SVG string, or "" on failure.
        """
        # ── Attempt 1 ─────────────────────────────────────────────────────────
        prompt = _SVG_PROMPT.format(image_prompt=image_prompt, concept=concept)
        raw    = await self.llm.generate_async("", [], prompt_override=prompt)
        svg    = _extract_svg(raw)

        if svg and _validate_svg(svg):
            log.info(f"SVG generated for concept: '{concept}'")
            return svg

        error = "SVG is missing, empty, or malformed" if not svg else _validate_svg_error(svg)

        # ── Attempt 2: retry with error feedback ──────────────────────────────
        log.warning(f"SVG attempt 1 failed ({error}) — retrying")
        retry_prompt = _SVG_RETRY_PROMPT.format(
            image_prompt=image_prompt,
            concept=concept,
            error=error,
        )
        raw2 = await self.llm.generate_async("", [], prompt_override=retry_prompt)
        svg2 = _extract_svg(raw2)

        if svg2 and _validate_svg(svg2):
            log.info(f"SVG generated (attempt 2) for concept: '{concept}'")
            return svg2

        log.error(f"SVG generation failed after 2 attempts for: '{concept}'")
        return ""

    def generate_image_sync(
        self,
        image_prompt: str,
        concept: str = "",
        output_filename: str = None,
    ) -> str:
        return asyncio.run(self.generate_image(image_prompt, concept, output_filename))


# ─────────────────────────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def _extract_svg(raw: str) -> str:
    """Extract SVG string from LLM response."""
    raw = raw.strip()

    # Try JSON {"svg": "..."} format
    try:
        data = json.loads(raw)
        svg = data.get("svg", "")
        if svg and "<svg" in svg:
            return svg.strip()
    except (json.JSONDecodeError, AttributeError):
        pass

    # Try extracting from markdown fences
    md = re.search(r"```(?:svg|xml)?\s*([\s\S]*?)```", raw)
    if md:
        candidate = md.group(1).strip()
        if "<svg" in candidate:
            return candidate

    # Try finding raw <svg>...</svg> block
    start = raw.find("<svg")
    end   = raw.rfind("</svg>")
    if start != -1 and end != -1:
        return raw[start:end + 6]

    return ""


def _validate_svg(svg: str) -> bool:
    """Basic SVG validation."""
    if not svg:
        return False
    if not svg.strip().startswith("<svg"):
        return False
    if "</svg>" not in svg:
        return False
    if len(svg) < 200:  # too short to be a real diagram
        return False
    return True


def _validate_svg_error(svg: str) -> str:
    """Return a human-readable error for why SVG validation failed."""
    if not svg:
        return "empty SVG"
    if not svg.strip().startswith("<svg"):
        return "SVG does not start with <svg tag"
    if "</svg>" not in svg:
        return "SVG is missing closing </svg> tag"
    if len(svg) < 200:
        return f"SVG is too short ({len(svg)} chars) — likely incomplete"
    return "unknown SVG error"
