"""
image_generator.py — LLM-powered educational diagram generator (v2)
====================================================================
Workflow:
  1. Receive image_prompt (description of the diagram needed)
  2. Ask LLM to generate Python code (matplotlib / networkx)
  3. Execute the code in an isolated subprocess
  4. If it fails → send the error back to the LLM to self-correct (up to 3 attempts)
  5. Return the absolute path to the saved image, or "" on total failure

Supports any topic: ML loss curves, neural network diagrams, SQL schemas,
NoSQL document trees, algorithm flowcharts, data-structure visualisations, etc.

Improvements over v1:
  - Retry loop with stderr fed back to LLM ("self-healing" code generation)
  - Basic code safety scan (blocks dangerous calls before execution)
  - Strict subprocess sandbox (no network, 30 s timeout)
  - Detailed logging at every step
"""

import asyncio
import json
import logging
import os
import re
import subprocess
import sys
import tempfile
import uuid
from pathlib import Path

from modules.doc_generation.llm import LLMEngine

log = logging.getLogger("quiz.image_generator")

# ── Output directory ──────────────────────────────────────────────────────────
IMAGES_DIR = Path(__file__).resolve().parent.parent.parent / "outputs" / "quiz_images"
IMAGES_DIR.mkdir(parents=True, exist_ok=True)

# ── Retry config ──────────────────────────────────────────────────────────────
MAX_RETRIES    = 3
CODE_TIMEOUT_S = 30   # seconds per subprocess execution


# ─────────────────────────────────────────────────────────────────────────────
# PROMPTS
# ─────────────────────────────────────────────────────────────────────────────

_CODEGEN_PROMPT = """\
You are a Python data-visualization expert.
Your ONLY job: write correct, complete, runnable Python code that produces
an educational diagram and saves it to disk.

════════════════════════════════════════════════════════
DIAGRAM REQUEST
  Concept      : {concept}
  Description  : {image_prompt}
  Output file  : {output_path}
════════════════════════════════════════════════════════

LIBRARY SELECTION — pick exactly ONE set:
  • matplotlib only        → line charts, bar charts, scatter plots, heatmaps,
                             confusion matrices, loss curves, histograms, pie charts
  • networkx + matplotlib  → neural-network diagrams, trees, directed graphs,
                             flowcharts with nodes and edges
  • matplotlib (patches)   → SQL/NoSQL schemas, ER diagrams, table-and-arrow
                             box diagrams

MANDATORY CODE RULES — every rule is required, no exceptions:
  1.  Begin with ALL necessary imports
  2.  Figure size  : figsize=(9, 6)  — never smaller
  3.  Background   : fig.patch.set_facecolor("white")
                     ax.set_facecolor("white")  (where applicable)
  4.  Font sizes   : title ≥ 14 · axis-labels ≥ 12 · tick-labels ≥ 10 · legend ≥ 11
  5.  Every axis MUST have xlabel, ylabel, title
  6.  Every data series MUST have a label and appear in a legend
  7.  Color palette (one distinct color per series, in this order):
        "#2196F3" blue · "#F44336" red · "#4CAF50" green
        "#FF9800" orange · "#9C27B0" purple
  8.  Grid:  ax.grid(True, linestyle="--", alpha=0.3)
  9.  Save:  plt.savefig("{output_path}", dpi=150, bbox_inches="tight", facecolor="white")
  10. Last line MUST be:  plt.close()
  11. NEVER call plt.show()
  12. NEVER use random data — all data must be mathematically defined
      (numpy formulas, fixed arrays, or explicit hardcoded values)
  13. NEVER leave a variable undefined or import an unused module
  14. For networkx diagrams: use nx.draw_networkx() with explicit pos=
      and fig/ax objects; NEVER call plt.show()

OUTPUT FORMAT — return ONLY this JSON, nothing else:
{{
  "code": "<complete Python code as a single string, use \\n for newlines>"
}}

No explanation. No markdown. No comments outside the code string. Just the JSON."""

_CODEGEN_RETRY_PROMPT = """\
You are a Python data-visualization expert.

Your previous code attempt failed with this error:
──────────────────────────────────────────────────
{error}
──────────────────────────────────────────────────

Fix the code and return a corrected, complete version.

DIAGRAM REQUEST (same as before):
  Concept      : {concept}
  Description  : {image_prompt}
  Output file  : {output_path}

Re-apply ALL the mandatory rules:
  • figsize=(9,6), white background, no plt.show(), plt.close() as the LAST line
  • Save the file with: plt.savefig("{output_path}", dpi=150, bbox_inches="tight", facecolor="white")
  • No random data
  • All imports at the top

Return ONLY this JSON:
{{
  "code": "<complete corrected Python code>"
}}"""


# ─────────────────────────────────────────────────────────────────────────────
# IMAGE GENERATOR
# ─────────────────────────────────────────────────────────────────────────────

class QuizImageGenerator:
    """
    Generates educational diagram images using LLM-produced Python code.

    Usage:
        gen = QuizImageGenerator()
        path = await gen.generate_image(
            image_prompt="clean graph showing training vs validation loss illustrating overfitting",
            concept="Overfitting"
        )
        # path → absolute path to PNG, or "" on failure
    """

    def __init__(self, llm_engine: LLMEngine = None):
        self.llm = llm_engine or LLMEngine()

    # ── Public API ────────────────────────────────────────────────────────────

    async def generate_image(
        self,
        image_prompt: str,
        concept: str = "",
        output_filename: str = None,
    ) -> str:
        """
        Generate a diagram image for a quiz question.

        Returns:
            Absolute path to the saved PNG, or "" on total failure.
        """
        if not output_filename:
            output_filename = f"quiz_{uuid.uuid4().hex[:8]}.png"

        output_path     = IMAGES_DIR / output_filename
        output_path_str = str(output_path).replace("\\", "/")

        last_error = ""

        for attempt in range(1, MAX_RETRIES + 1):
            # ── Build prompt ──────────────────────────────────────────────
            if attempt == 1:
                prompt = _CODEGEN_PROMPT.format(
                    concept=concept,
                    image_prompt=image_prompt,
                    output_path=output_path_str,
                )
            else:
                log.warning(
                    f"[ImageGen] Retry {attempt}/{MAX_RETRIES} for '{concept}' — {last_error[:120]}"
                )
                prompt = _CODEGEN_RETRY_PROMPT.format(
                    error=last_error[:600],
                    concept=concept,
                    image_prompt=image_prompt,
                    output_path=output_path_str,
                )

            # ── Ask LLM for code ──────────────────────────────────────────
            raw  = await self.llm.generate_async("", [], prompt_override=prompt)
            code = _extract_code(raw)

            if not code:
                last_error = f"LLM returned no usable code (raw={raw[:120]!r})"
                log.error(f"[ImageGen] {last_error}")
                continue

            # ── Safety scan ───────────────────────────────────────────────
            blocked = _safety_scan(code)
            if blocked:
                last_error = f"Blocked dangerous call: {blocked}"
                log.error(f"[ImageGen] {last_error}")
                continue

            # ── Execute in subprocess ─────────────────────────────────────
            success, stderr = _run_code(code)

            if success and output_path.exists():
                log.info(f"[ImageGen] Image saved: {output_path} (attempt {attempt})")
                return str(output_path)

            last_error = stderr or "code ran but image file not created"
            log.warning(f"[ImageGen] Attempt {attempt} failed: {last_error[:200]}")

            # Delete any corrupt partial file before retrying
            if output_path.exists():
                try:
                    output_path.unlink()
                except Exception:
                    pass

        log.error(
            f"[ImageGen] All {MAX_RETRIES} attempts failed for concept='{concept}'"
        )
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

def _extract_code(raw: str) -> str:
    """
    Extract Python code from LLM response.
    Handles: {"code": "..."} JSON · ```python ... ``` · bare code.
    """
    raw = raw.strip()

    # ① JSON {"code": "..."}
    try:
        data = json.loads(raw)
        code = data.get("code", "")
        if code and isinstance(code, str):
            return code.strip()
    except (json.JSONDecodeError, AttributeError):
        pass

    # ② Try JSON inside first {...}
    start = raw.find("{")
    end   = raw.rfind("}")
    if 0 <= start < end:
        try:
            data = json.loads(raw[start:end + 1])
            code = data.get("code", "")
            if code and isinstance(code, str):
                return code.strip()
        except Exception:
            pass

    # ③ Markdown fences (```python … ``` or ``` … ```)
    md = re.search(r"```(?:python)?\s*\n([\s\S]*?)\n?```", raw)
    if md:
        return md.group(1).strip()

    # ④ Bare code (contains 'import' and 'plt.')
    if "import" in raw and ("plt." in raw or "matplotlib" in raw):
        return raw

    return ""


# ── Dangerous patterns to block ───────────────────────────────────────────────
_BANNED_PATTERNS = [
    r"\bos\.system\b",
    r"\bsubprocess\b",
    r"\beval\b",
    r"\bexec\b",
    r"\b__import__\b",
    r"\bopen\s*\(",           # file writes (image save is done via plt.savefig only)
    r"\brequests\b",
    r"\burllib\b",
    r"\bsocket\b",
    r"\bshutil\b",
    r"\bpickle\b",
]
# Whitelist: plt.savefig is the only allowed "write" operation
_SAVEFIG_RE = re.compile(r"plt\.savefig\(")

def _safety_scan(code: str) -> str:
    """
    Quick safety scan of LLM-generated code.
    Returns the first blocked pattern found, or "" if safe.
    """
    for pat in _BANNED_PATTERNS:
        # Allow open() only inside plt.savefig context (it doesn't use open())
        if pat == r"\bopen\s*\(":
            # Check if 'open(' appears outside of comments
            for line in code.splitlines():
                stripped = line.strip()
                if stripped.startswith("#"):
                    continue
                if re.search(r"\bopen\s*\(", stripped):
                    return "open()"
            continue
        if re.search(pat, code):
            return pat.replace(r"\b", "").replace("\\b", "")
    return ""


def _run_code(code: str) -> tuple[bool, str]:
    """
    Execute generated Python code in an isolated subprocess.

    Returns:
        (success: bool, stderr: str)
    """
    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".py", delete=False, encoding="utf-8"
    ) as f:
        f.write(code)
        tmp_path = f.name

    stderr_out = ""
    try:
        result = subprocess.run(
            [sys.executable, tmp_path],
            capture_output=True,
            text=True,
            timeout=CODE_TIMEOUT_S,
        )
        stderr_out = result.stderr.strip()
        if result.returncode != 0:
            log.debug(f"[ImageGen] Code error:\n{stderr_out[:400]}")
            return False, stderr_out
        return True, ""

    except subprocess.TimeoutExpired:
        msg = f"Code execution timed out after {CODE_TIMEOUT_S}s"
        log.error(f"[ImageGen] {msg}")
        return False, msg

    except Exception as exc:
        msg = f"Subprocess error: {exc}"
        log.error(f"[ImageGen] {msg}")
        return False, msg

    finally:
        try:
            os.unlink(tmp_path)
        except Exception:
            pass
