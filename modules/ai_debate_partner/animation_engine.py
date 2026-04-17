"""
animation_engine.py — Dynamic Manim animation generator for Aria
=================================================================
Workflow:
  1. Receive topic from /animation command
  2. Ask LLM to generate a complete Manim Python scene (Text-only, no LaTeX)
  3. Write scene to a temp file
  4. Render with Manim via subprocess (using hardcoded FFmpeg path)
  5. Return the video path for the API to serve

No LaTeX required — uses Text() and Unicode math symbols only.
"""

import asyncio
import logging
import os
import re
import subprocess
import sys
import tempfile
import uuid
from pathlib import Path

from modules.doc_generation.llm import LLMEngine

log = logging.getLogger("debate.animation")

# Output directory for rendered videos
VIDEOS_DIR = Path(__file__).resolve().parent.parent.parent / "outputs" / "animations"
VIDEOS_DIR.mkdir(parents=True, exist_ok=True)

# FFmpeg path — found via winget install
FFMPEG_PATH = r"C:\Users\mokht\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.1-full_build\bin\ffmpeg.exe"

# ─────────────────────────────────────────────────────────────────────────────
# LLM PROMPT
# ─────────────────────────────────────────────────────────────────────────────

_CODEGEN_PROMPT = """\
You are an expert Manim animation developer. Generate a PRECISE, ACCURATE educational animation.

Topic: "{topic}"

═══════════════════════════════════════════════════════════
MANDATORY RULES
═══════════════════════════════════════════════════════════
1. Class name MUST be exactly: AnimationScene
2. Import ONLY: from manim import *
3. NEVER use MathTex, Tex, LaTeX — use Text() ONLY
4. Use Unicode for math: α β θ ∇ Σ ² ³ √ ≈ ≤ ≥ × ÷ →
5. Scene: 20-30 seconds, self.wait(1) between steps
6. Title: Text("...").scale(0.9).to_edge(UP) — always first
7. Keep ALL objects within: x ∈ [-6,6], y ∈ [-3.2,3.2]
8. NEVER overlap text with shapes — use .next_to() with buff≥0.3

═══════════════════════════════════════════════════════════
TOPIC-SPECIFIC LAYOUT (follow exactly for these topics)
═══════════════════════════════════════════════════════════

NEURAL NETWORK / LAYERS:
  layers = [3, 4, 2]  # nodes per layer
  x_positions = [-4, 0, 4]  # one x per layer
  For layer i with n nodes: y_positions = [j - (n-1)/2 for j in range(n)]
  Each node: Circle(radius=0.3).move_to([x_positions[i], y_pos, 0])
  Connections: Line(node_a.get_center(), node_b.get_center(), stroke_width=1)
  Draw ALL connections between adjacent layers
  Colors: input=BLUE, hidden=GREEN, output=RED
  Labels: Text("Input").next_to(input_group, DOWN, buff=0.4)
  Animate: layers appear one by one → connections appear → data flows (highlight one path)

OVERFITTING:
  axes = Axes(x_range=[0,10,2], y_range=[0,10,2], x_length=8, y_length=5)
  data_points = [(1,2),(2,3.5),(3,2.8),(4,5),(5,4.5),(6,6),(7,5.5),(8,7),(9,6.5)]
  good_fit = axes.plot(lambda x: 0.7*x + 1, color=GREEN)
  overfit = axes.plot(lambda x: -0.05*x**4 + 0.8*x**3 - 4*x**2 + 8*x - 1, color=RED)
  Show: data → good fit (label "Good Model") → Transform to overfit (label "Overfit")

GRADIENT DESCENT:
  axes = Axes(x_range=[-3,7,1], y_range=[0,25,5], x_length=8, y_length=5)
  curve = axes.plot(lambda x: (x-2)**2 + 1, color=BLUE)
  dot = Dot(axes.c2p(6, (6-2)**2+1), color=YELLOW)
  Animate dot moving: x=6 → x=4 → x=2.5 → x=2 (minimum)
  Show arrow at each step indicating gradient direction

DECISION TREE:
  Draw rectangles as nodes, arrows as edges
  Root at top center, branches going down-left and down-right
  Show condition text inside each node
  Animate level by level: root → level 1 → level 2

BACKPROPAGATION:
  Draw neural network (same as above)
  Forward pass: highlight path left→right (YELLOW)
  Show error at output: Text("Error = 0.8", color=RED)
  Backward pass: highlight path right→left (ORANGE)
  Show weight update arrows

LINEAR REGRESSION:
  axes with scatter data points
  Animate regression line fitting: start horizontal → rotate to best fit
  Show residual lines (vertical dashes from points to line)

FOR ANY OTHER TOPIC:
  Step 1: Title + brief definition text
  Step 2: Main visual (diagram, graph, or structured text)
  Step 3: Key properties or steps (animated one by one)
  Step 4: Summary text at bottom

═══════════════════════════════════════════════════════════
CRITICAL MANIM API RULES (common mistakes to avoid)
═══════════════════════════════════════════════════════════
- self.play() ONLY accepts Animation objects, NEVER raw Mobjects
  WRONG: self.play(circle)
  RIGHT: self.play(Create(circle)) or self.play(GrowFromCenter(circle))
- To show multiple objects at once: self.play(Create(a), Create(b), FadeIn(c))
- To add without animation: self.add(obj)  — use for background elements
- Line() takes start and end as numpy arrays or lists: Line([-1,0,0], [1,0,0])
- Circle().move_to([x, y, 0]) — always use 3D coordinates
- VGroup(*list_of_mobjects) — group before animating together
- self.play(AnimationGroup(*[Create(n) for n in nodes], lag_ratio=0.1))
- Use GrowFromCenter for nodes, Create for lines, Write for text
- Smooth transitions: run_time=1.5 for important animations
- Group related elements with VGroup before animating
- End with a clear summary sentence at the bottom

Return ONLY this JSON (no markdown, no explanation):
{{
  "code": "<complete Python code, use \\n for newlines>",
  "description": "<one accurate sentence describing what the animation shows>"
}}"""

_FALLBACK_PROMPT = """\
Generate a SIMPLE Manim animation for: "{topic}"

Keep it minimal — just text and basic shapes. No complex indexing.

from manim import *

class AnimationScene(Scene):
    def construct(self):
        # Title
        title = Text("{topic}", font_size=48)
        self.play(Write(title))
        self.play(title.animate.to_edge(UP))
        self.wait(0.5)
        
        # Add 3-4 key points as Text objects, stacked vertically
        points = [
            "Point 1 about {topic}",
            "Point 2 about {topic}",
            "Point 3 about {topic}",
        ]
        # Position them manually
        for i, pt in enumerate(points):
            t = Text(pt, font_size=28)
            t.move_to([0, 1 - i * 1.2, 0])
            self.play(FadeIn(t))
            self.wait(0.5)
        self.wait(2)

Generate a REAL version of this pattern for "{topic}" with accurate content.
Use ONLY Text(), FadeIn, Write, Create. NO indexing into lists. NO VGroup indexing.
Position everything with .move_to([x, y, 0]) using explicit coordinates.

Return ONLY JSON: {{"code": "<complete code>", "description": "<description>"}}"""

_REPAIR_PROMPT = (
    "The Manim code you generated failed with this error:\n{error}\n\n"
    "Failed code:\n{code}\n\n"
    "Fix the code. Most common errors:\n"
    "1. self.play(Circle()) is wrong -- wrap in animation: self.play(Create(Circle()))\n"
    "2. IndexError: list index out of range -- use enumerate() not hardcoded indices\n"
    "3. Never pass raw Mobjects to self.play() -- always wrap in Create/FadeIn/Write\n"
    "4. Class name must be AnimationScene\n"
    "5. No MathTex/Tex/LaTeX -- Text() only\n"
    "6. No imports beyond: from manim import *\n\n"
    'Return ONLY JSON: {{"code": "<fixed code>", "description": "<description>"}}'
)


# ─────────────────────────────────────────────────────────────────────────────
# ANIMATION ENGINE
# ─────────────────────────────────────────────────────────────────────────────

class AnimationEngine:
    def __init__(self, llm_engine: LLMEngine = None):
        self.llm = llm_engine or LLMEngine()

    async def generate(self, topic: str) -> dict:
        """
        Generate and render a Manim animation for the given topic.
        Returns {"video_path": str, "description": str} or {"error": str}
        """
        import json

        # ── Step 1: Generate Manim code ───────────────────────────────────────
        print(f"\n🎬 [Animation] Generating Manim code for: '{topic}'", flush=True)
        prompt = _CODEGEN_PROMPT.format(topic=topic) + f"\n\n# seed: {uuid.uuid4().hex[:8]}"
        raw = await self.llm.generate_async("", [], prompt_override=prompt)

        code, description = _extract_code_and_desc(raw)
        if not code:
            print(f"❌ [Animation] LLM returned no usable code. Raw response:\n{raw[:400]}", flush=True)
            log.error(f"LLM returned no code for topic: {topic}")
            return {"error": "Failed to generate animation code"}

        print(f"✅ [Animation] Code generated ({len(code)} chars). Starting render…", flush=True)

        # ── Step 2: Render (with one retry on failure) ────────────────────────
        print(f"⚙️  [Animation] Running Manim render (this takes 30–90s)…", flush=True)
        video_path, error = await asyncio.to_thread(_render, code, topic)

        if not video_path and error:
            print(f"⚠️  [Animation] Render attempt 1 failed:\n{error[:300]}", flush=True)
            print(f"🔁 [Animation] Asking LLM to fix the code…", flush=True)
            log.warning(f"Render attempt 1 failed: {error[:200]} — retrying")
            repair_prompt = _REPAIR_PROMPT.format(error=error[:500], code=code[:3000])
            raw2 = await self.llm.generate_async("", [], prompt_override=repair_prompt)
            code2, description2 = _extract_code_and_desc(raw2)
            if code2:
                if description2:
                    description = description2
                print(f"⚙️  [Animation] Re-rendering fixed code…", flush=True)
                video_path, error2 = await asyncio.to_thread(_render, code2, topic)
                if video_path:
                    print(f"✅ [Animation] Fixed render succeeded!", flush=True)
                else:
                    print(f"❌ [Animation] Fixed render also failed:\n{error2[:300]}", flush=True)
                    # Attempt 3: simple fallback
                    print(f"🔁 [Animation] Trying simple fallback…", flush=True)
                    fallback_prompt = _FALLBACK_PROMPT.format(topic=topic)
                    raw3 = await self.llm.generate_async("", [], prompt_override=fallback_prompt)
                    code3, description3 = _extract_code_and_desc(raw3)
                    if code3:
                        if description3:
                            description = description3
                        video_path, error3 = await asyncio.to_thread(_render, code3, topic)
                        if video_path:
                            print(f"✅ [Animation] Fallback render succeeded!", flush=True)
                        else:
                            print(f"❌ [Animation] All 3 attempts failed.", flush=True)
            else:
                print(f"❌ [Animation] LLM repair returned no usable code.", flush=True)

        if not video_path:
            log.error(f"Animation render failed for '{topic}': {error}")
            return {"error": f"Render failed: {error[:200] if error else 'unknown error'}"}

        print(f"🎉 [Animation] Done! Video saved to: {video_path}", flush=True)
        log.info(f"Animation ready: {video_path}")
        return {"video_path": str(video_path), "description": description}


# ─────────────────────────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def _extract_code_and_desc(raw: str) -> tuple[str, str]:
    """Extract code and description from LLM JSON response."""
    import json as _json

    # Strip markdown fences that LLMs often add around JSON
    text = raw.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    text = text.strip()

    # Attempt 1: direct parse
    try:
        data = _json.loads(text)
        return data.get("code", "").strip(), data.get("description", "")
    except Exception:
        pass

    # Attempt 2: find the JSON object (non-greedy inner content)
    match = re.search(r"\{([\s\S]*)\}", text)
    if match:
        try:
            data = _json.loads(match.group(0))
            return data.get("code", "").strip(), data.get("description", "")
        except Exception:
            # Attempt 3: JSON may have unescaped newlines inside string values — fix them
            try:
                fixed = re.sub(
                    r'("code"\s*:\s*")([\s\S]*?)("(?:\s*,|\s*\}))',
                    lambda m: m.group(1) + m.group(2).replace("\n", "\\n").replace("\r", "") + m.group(3),
                    match.group(0),
                )
                data = _json.loads(fixed)
                return data.get("code", "").strip(), data.get("description", "")
            except Exception:
                pass

    # Attempt 4: LLM returned a raw Python code block — extract it directly
    code_match = re.search(r"```python\s*([\s\S]+?)```", raw)
    if code_match:
        return code_match.group(1).strip(), ""

    return "", ""


def _render(code: str, topic: str) -> tuple[str | None, str | None]:
    """
    Write code to temp file, render with Manim, copy output to VIDEOS_DIR.
    Returns (video_path, error_message).
    """
    # Set FFmpeg in environment
    env = os.environ.copy()
    ffmpeg_dir = str(Path(FFMPEG_PATH).parent)
    env["PATH"] = ffmpeg_dir + os.pathsep + env.get("PATH", "")

    safe_topic = re.sub(r"[^\w]", "_", topic.lower())[:30]
    output_name = f"{safe_topic}_{uuid.uuid4().hex[:6]}.mp4"
    output_path = VIDEOS_DIR / output_name

    with tempfile.TemporaryDirectory(prefix="manim_") as tmp:
        scene_file = Path(tmp) / "scene.py"
        scene_file.write_text(code, encoding="utf-8")

        cmd = [
            sys.executable, "-m", "manim",
            "render",
            "--media_dir", tmp,
            "-qm",           # medium quality (720p)
            "--format", "mp4",
            str(scene_file),
            "AnimationScene",
        ]

        print(f"   → Writing scene to {scene_file}", flush=True)
        print(f"   → Running: {' '.join(cmd[-3:])}", flush=True)

        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=120,
                env=env,
                cwd=tmp,
            )
        except subprocess.TimeoutExpired:
            print("   → ❌ Timed out after 120s", flush=True)
            return None, "Render timed out (120s)"
        except Exception as e:
            print(f"   → ❌ Subprocess error: {e}", flush=True)
            return None, str(e)

        if result.returncode != 0:
            err = (result.stderr or result.stdout or "")[-600:]
            print(f"   → ❌ Manim exited with code {result.returncode}", flush=True)
            return None, err

        print(f"   → ✅ Manim render complete", flush=True)

        # Find the rendered mp4 — exclude partial_movie_files subdirectory
        import shutil
        mp4_files = [
            p for p in Path(tmp).rglob("*.mp4")
            if "partial_movie_files" not in p.parts
        ]
        if not mp4_files:
            return None, "No mp4 output found after render"

        # Pick the largest file — partials are small, the final concat is biggest
        best = max(mp4_files, key=lambda p: p.stat().st_size)
        shutil.copy2(str(best), str(output_path))
        return output_path, None
