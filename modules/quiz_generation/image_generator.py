"""
image_generator.py — Educational diagram generator (Mermaid + Recharts)
=======================================================================
Strategy:
  - Structural diagrams (flowcharts, ER diagrams, trees, pipelines) → Mermaid syntax
  - Data visualizations (line/bar/scatter/area charts) → Recharts JSON spec
  LLM picks the right renderer and outputs structured data — no raw SVG authoring.

Output format:
  {"render_type": "mermaid",   "code": "<mermaid syntax>"}
  {"render_type": "recharts",  "spec": { chart_type, title, x_axis, y_axis, series, data }}
"""

import asyncio
import json
import logging
import re

from modules.doc_generation.llm import LLMEngine

log = logging.getLogger("quiz.image_generator")


# ─────────────────────────────────────────────────────────────────────────────
# PROMPT
# ─────────────────────────────────────────────────────────────────────────────

_DIAGRAM_PROMPT = """\
You are an expert educational diagram creator. Your job is to generate a precise,
accurate diagram for a quiz question. Choose the renderer that gives the most
accurate result for the concept.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DIAGRAM REQUEST
  Concept     : {concept}
  Description : {image_prompt}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CHOOSE ONE RENDERER:

━━ OPTION A — "recharts" — for DATA VISUALIZATIONS ━━
Use when the concept requires a chart with actual data values:
  • line  → loss curves, ROC curve, learning rate schedule, activation functions
             (sigmoid/ReLU/tanh), gradient descent convergence
  • bar   → feature importance, accuracy comparison, histogram, class distribution
  • area  → probability distributions, confidence intervals
  • scatter → clustering results (K-Means, DBSCAN), decision boundaries

━━ OPTION B — "mermaid" — for STRUCTURAL DIAGRAMS ━━
Use when the concept is about structure, flow, or relationships:
  • flowchart TD/LR → neural network layers, CNN architecture, training pipeline,
                      backpropagation, data preprocessing, transformer blocks
  • erDiagram       → SQL table schemas, ER diagrams, database relationships
  • graph TD/LR     → decision trees, binary trees, dependency graphs
  • sequenceDiagram → client-server, API request-response, HTTP flow
  • classDiagram    → UML class diagrams, OOP inheritance, design patterns

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT FORMAT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

FOR recharts — return EXACTLY this JSON:
{{
  "render_type": "recharts",
  "spec": {{
    "chart_type": "line",
    "title": "Training vs Validation Loss",
    "x_axis": {{ "dataKey": "epoch", "label": "Epochs" }},
    "y_axis": {{ "label": "Loss" }},
    "series": [
      {{ "dataKey": "train_loss", "name": "Training Loss", "color": "#2196F3" }},
      {{ "dataKey": "val_loss",   "name": "Validation Loss", "color": "#F44336" }}
    ],
    "data": [
      {{ "epoch": 0,  "train_loss": 0.95, "val_loss": 0.92 }},
      {{ "epoch": 2,  "train_loss": 0.80, "val_loss": 0.79 }},
      {{ "epoch": 4,  "train_loss": 0.65, "val_loss": 0.66 }},
      {{ "epoch": 6,  "train_loss": 0.52, "val_loss": 0.56 }},
      {{ "epoch": 8,  "train_loss": 0.42, "val_loss": 0.50 }},
      {{ "epoch": 10, "train_loss": 0.35, "val_loss": 0.48 }},
      {{ "epoch": 12, "train_loss": 0.30, "val_loss": 0.51 }},
      {{ "epoch": 14, "train_loss": 0.27, "val_loss": 0.57 }},
      {{ "epoch": 16, "train_loss": 0.25, "val_loss": 0.64 }},
      {{ "epoch": 18, "train_loss": 0.23, "val_loss": 0.72 }}
    ]
  }}
}}

recharts RULES:
- Use 8–15 data points for line/area, 4–10 bars for bar charts
- Use REALISTIC, ACCURATE values — not random or approximate
- dataKey names: simple alphanumeric + underscore only (e.g. "train_loss", "epoch")
- Colors: #2196F3 blue, #F44336 red, #4CAF50 green, #FF9800 orange, #9C27B0 purple
- For scatter charts: each series object may include its own "data" array of {{x, y}} pairs

FOR mermaid — return EXACTLY this JSON:
{{
  "render_type": "mermaid",
  "code": "flowchart LR\\n  A[Input Layer] --> B[Hidden Layer]\\n  B --> C[Output Layer]"
}}

mermaid RULES:
- Valid Mermaid v11 syntax — will be rendered directly by mermaid.js
- flowchart direction: TD for trees/hierarchies, LR for left-to-right pipelines
- Max ~20 nodes — keep it focused and readable
- Use descriptive labels: A[Descriptive Label] not just A
- For erDiagram: use proper ||--o{{ or }}|--|| relationship notation
- For SQL JOIN diagrams: use flowchart with clear table names and join conditions
- Escape double quotes inside labels with single quotes or backslash
- Use \\n for newlines inside the JSON string

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Return ONLY the JSON object — no markdown fences, no explanation.
"""

_RETRY_PROMPT = """\
Your previous diagram had this error: {error}

Regenerate the diagram for:
  Concept     : {concept}
  Description : {image_prompt}

Fix the error and return ONLY a valid JSON object in one of these two formats:

For data charts:
{{"render_type": "recharts", "spec": {{"chart_type": "line|bar|area|scatter", "title": "...",
  "x_axis": {{"dataKey": "...", "label": "..."}}, "y_axis": {{"label": "..."}},
  "series": [{{"dataKey": "...", "name": "...", "color": "#..."}}],
  "data": [{{...}}]}}}}

For structural diagrams:
{{"render_type": "mermaid", "code": "flowchart TD\\n  A --> B"}}

Return ONLY the JSON — no markdown, no explanation.
"""


# ─────────────────────────────────────────────────────────────────────────────
# IMAGE GENERATOR
# ─────────────────────────────────────────────────────────────────────────────

class QuizImageGenerator:
    """
    Generates educational diagrams using Mermaid or Recharts.
    Returns a dict: {"render_type": "mermaid", "code": "..."} or
                    {"render_type": "recharts", "spec": {...}}
    Returns {} on failure.
    """

    def __init__(self, llm_engine: LLMEngine = None, namespace: str = "quiz"):
        self.llm = llm_engine or LLMEngine(namespace=namespace)

    async def generate_image(
        self,
        image_prompt: str,
        concept: str = "",
        output_filename: str = None,  # kept for API compatibility
    ) -> dict:
        """Generate diagram data. Returns dict or {} on failure."""
        # ── Attempt 1 ──────────────────────────────────────────────────────
        prompt = _DIAGRAM_PROMPT.format(image_prompt=image_prompt, concept=concept)
        raw    = await self.llm.generate_async("", [], prompt_override=prompt)
        data   = _parse_diagram(raw)
        error  = _validate_diagram(data)

        if data and not error:
            log.info(f"Diagram ({data.get('render_type')}) generated for: '{concept}'")
            return data

        err_msg = error or "empty or unparseable response"

        # ── Attempt 2: retry with error feedback ───────────────────────────
        log.warning(f"Diagram attempt 1 failed ({err_msg}) — retrying for '{concept}'")
        retry = _RETRY_PROMPT.format(
            image_prompt=image_prompt,
            concept=concept,
            error=err_msg,
        )
        raw2  = await self.llm.generate_async("", [], prompt_override=retry)
        data2 = _parse_diagram(raw2)
        err2  = _validate_diagram(data2)

        if data2 and not err2:
            log.info(f"Diagram ({data2.get('render_type')}) generated (attempt 2) for: '{concept}'")
            return data2

        log.error(f"Diagram generation failed after 2 attempts for: '{concept}'")
        return {}

    def generate_image_sync(
        self,
        image_prompt: str,
        concept: str = "",
        output_filename: str = None,
    ) -> dict:
        return asyncio.run(self.generate_image(image_prompt, concept, output_filename))


# ─────────────────────────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def _parse_diagram(raw: str) -> dict:
    """Extract diagram dict from LLM response."""
    raw = raw.strip()

    # Direct JSON parse
    try:
        data = json.loads(raw)
        if isinstance(data, dict):
            return data
    except (json.JSONDecodeError, ValueError):
        pass

    # Strip markdown fences
    md = re.search(r"```(?:json)?\s*\n?([\s\S]*?)\n?```", raw)
    if md:
        try:
            data = json.loads(md.group(1).strip())
            if isinstance(data, dict):
                return data
        except (json.JSONDecodeError, ValueError):
            pass

    # Find first {...} block
    start = raw.find("{")
    end   = raw.rfind("}")
    if 0 <= start < end:
        try:
            data = json.loads(raw[start:end + 1])
            if isinstance(data, dict):
                return data
        except (json.JSONDecodeError, ValueError):
            pass

    return {}


def _validate_diagram(data: dict) -> str:
    """Return error string if invalid, empty string if valid."""
    if not data:
        return "empty or unparseable response"

    rt = data.get("render_type")
    if rt not in ("mermaid", "recharts"):
        return f"render_type must be 'mermaid' or 'recharts', got {rt!r}"

    if rt == "mermaid":
        code = data.get("code", "")
        if not code or not isinstance(code, str):
            return "mermaid 'code' field is missing or empty"
        if len(code.strip()) < 10:
            return f"mermaid code is too short ({len(code)} chars)"
        return ""

    if rt == "recharts":
        spec = data.get("spec")
        if not isinstance(spec, dict):
            return "'spec' field is missing or not an object"
        if spec.get("chart_type") not in ("line", "bar", "area", "scatter"):
            return f"chart_type must be line/bar/area/scatter, got {spec.get('chart_type')!r}"
        if not spec.get("data") and not any(
            s.get("data") for s in (spec.get("series") or [])
        ):
            return "'data' array is missing or empty"
        if not spec.get("series"):
            return "'series' array is missing or empty"
        return ""

    return ""
