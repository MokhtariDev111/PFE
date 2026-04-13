"""
quiz_generator.py — 3-step quiz generation pipeline (v2)
=========================================================
Improvements over v1:
  - Robust JSON parsing: handles markdown fences, extra text, bare arrays
  - Auto-retry with targeted error feedback (up to 3 attempts per step)
  - Post-generation validation + auto-fix via QuizValidator
  - image_questions_count auto-capping (never exceeds total_questions)
  - Graceful partial-result acceptance (≥80% of requested questions)
  - Sync wrappers for non-async callers
"""

import asyncio
import json
import logging
import re

from modules.doc_generation.llm import LLMEngine

log = logging.getLogger("quiz.generator")

MAX_RETRIES = 3          # max LLM call attempts per step
PARTIAL_THRESHOLD = 0.8  # accept if we got ≥80% of requested questions


# ─────────────────────────────────────────────────────────────────────────────
# ROBUST JSON PARSER  (shared across the whole quiz_generation package)
# ─────────────────────────────────────────────────────────────────────────────

def parse_json_safe(raw: str):
    """
    Multi-strategy JSON extractor — handles all common LLM quirks:
      ① Clean JSON        {"key": ...} or [...]
      ② Markdown fences   ```json ... ``` or ``` ... ```
      ③ Text before/after JSON — finds first { ... } or [ ... ] block

    Returns the parsed Python object (dict or list), or None on failure.
    """
    raw = raw.strip()

    # ① Direct parse
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass

    # ② Strip markdown fences
    md = re.search(r"```(?:json)?\s*\n?([\s\S]*?)\n?```", raw)
    if md:
        try:
            return json.loads(md.group(1).strip())
        except json.JSONDecodeError:
            pass

    # ③ Extract first {...} or [...] block
    for start_ch, end_ch in [('{', '}'), ('[', ']')]:
        start = raw.find(start_ch)
        end   = raw.rfind(end_ch)
        if 0 <= start < end:
            try:
                return json.loads(raw[start:end + 1])
            except json.JSONDecodeError:
                pass

    return None


# ─────────────────────────────────────────────────────────────────────────────
# PROMPTS
# ─────────────────────────────────────────────────────────────────────────────

_STEP1_PROMPT = """\
You are an educational content expert.

The teacher wants to create a quiz about: "{topic}"

Break this topic into all relevant subtopics and key concepts, organized by category
from basic/foundational to advanced.

Return ONLY a valid JSON object — no markdown, no explanation:
{{
  "topic": "{topic}",
  "categories": [
    {{
      "name": "Category name (e.g. Fundamentals, Algorithms, Applications)",
      "concepts": ["Concept A", "Concept B", "Concept C"]
    }}
  ]
}}

Rules:
- 4 to 6 categories
- 5 to 8 concepts per category
- Cover the topic thoroughly from basics to advanced
- All text MUST be written in {language}
- JSON only, no extra text"""

_STEP1_RETRY_PROMPT = """\
You are an educational content expert.

Your previous response had this issue: {error}

Try again for topic: "{topic}"

Return ONLY this exact JSON structure — no markdown, no explanation:
{{
  "topic": "{topic}",
  "categories": [
    {{
      "name": "Category name",
      "concepts": ["concept1", "concept2", "concept3"]
    }}
  ]
}}

Requirements: 4–6 categories, 5–8 concepts each, all text in {language}, JSON only."""

_STEP3_PROMPT = """\
You are an intelligent quiz generation system specialized in high-quality educational content.

Generate a quiz with EXACTLY these parameters:
  Topic             : {topic}
  Selected concepts : {selected_concepts}
  Total questions   : {total_questions}
  Image questions   : {image_count}   (type = "image")
  Text questions    : {text_count}    (type = "text")
  Language          : ALL questions, options, answers MUST be written in {language}

STRICT RULES:
  1.  Total = EXACTLY {total_questions} questions — no more, no less
  2.  Exactly {image_count} questions must have "type": "image"
  3.  Exactly {text_count} questions must have "type": "text"
  4.  Distribute questions as evenly as possible across the selected concepts
  5.  Each question targets ONLY ONE concept from the selected list
  6.  NEVER use a concept outside the selected list
  7.  Difficulty mix: ~40% easy · ~40% medium · ~20% hard
  8.  Format mix: MCQ (4 options), True/False, Short Answer
  9.  MCQ: exactly 4 options, one clearly correct, three plausible distractors
  10. True/False: options must be exactly ["True", "False"]
  11. All answers must be 100% factually correct
  12. Never reveal the answer inside the question text
  13. Every question MUST have an "explanation" field (1-2 sentences why the answer is correct)
  14. Image questions: write a detailed "image_prompt" describing a clean,
      labeled educational diagram (e.g. "clean labeled line chart showing
      training vs validation loss illustrating overfitting, x-axis Epochs,
      y-axis Loss, blue solid line training, red dashed line validation,
      white background, minimal textbook style")

Return ONLY a valid JSON object — no markdown, no explanation:
{{
  "questions": [
    {{
      "type": "text",
      "question": "Clear, well-written question text",
      "format": "mcq",
      "concept": "exact concept from selected_concepts",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "answer": "Option A",
      "difficulty": "easy",
      "explanation": "Option A is correct because..."
    }},
    {{
      "type": "image",
      "question": "Question that requires looking at the diagram",
      "format": "mcq",
      "concept": "exact concept from selected_concepts",
      "image_prompt": "Detailed description of the educational diagram to generate",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "answer": "Option B",
      "difficulty": "medium",
      "explanation": "Option B is correct because..."
    }}
  ]
}}"""

_STEP3_RETRY_PROMPT = """\
You are an intelligent quiz generation system.

Your previous response had this issue: {error}

Regenerate the quiz with these EXACT parameters:
  Topic           : {topic}
  Concepts        : {selected_concepts}
  Total questions : EXACTLY {total_questions}
  Image questions : EXACTLY {image_count}
  Text questions  : EXACTLY {text_count}
  Language        : {language}

Return ONLY a valid JSON object with a "questions" array.
No markdown. No explanation. No extra text. Just the JSON."""


# ─────────────────────────────────────────────────────────────────────────────
# QUIZ GENERATOR
# ─────────────────────────────────────────────────────────────────────────────

class QuizGenerator:
    """
    3-step quiz generator with retry logic and post-generation validation.

    Step 1 — extract_concepts(topic)
        → {"topic": str, "concepts": [str, ...]}

    Step 2 — caller selects a subset of concepts (external responsibility)

    Step 3 — generate_quiz(topic, selected_concepts, total_questions, image_count)
        → [question_dict, ...]

    Each step retries up to MAX_RETRIES times on failure, passing the error
    back to the LLM so it can self-correct.
    """

    def __init__(self, llm_engine: LLMEngine = None):
        self.llm = llm_engine or LLMEngine()
        # Import here to avoid circular imports
        from modules.quiz_generation.quiz_validator import QuizValidator
        self.validator = QuizValidator()

    # ── Step 1 ────────────────────────────────────────────────────────────────

    async def extract_concepts(self, topic: str, language: str = "English") -> dict:
        """
        Step 1: Extract structured concept tree grouped by category.

        Returns:
            {"topic": str, "categories": [{"name": str, "concepts": [str]}]}
            On failure: {"topic": str, "categories": []}
        """
        last_error = ""

        for attempt in range(1, MAX_RETRIES + 1):
            if attempt == 1:
                prompt = _STEP1_PROMPT.format(topic=topic, language=language)
            else:
                log.warning(f"[Step 1] Retry {attempt}/{MAX_RETRIES} — {last_error}")
                prompt = _STEP1_RETRY_PROMPT.format(topic=topic, language=language, error=last_error)

            raw  = await self.llm.generate_async("", [], prompt_override=prompt)
            data = parse_json_safe(raw)

            if not data:
                last_error = f"Response is not valid JSON. Got: {raw[:120]!r}"
                continue

            if not isinstance(data, dict):
                last_error = f"Expected a JSON object, got {type(data).__name__}"
                continue

            # New format: categories
            if "categories" in data:
                categories = data["categories"]
                if not isinstance(categories, list) or len(categories) == 0:
                    last_error = "'categories' key is empty or not a list"
                    continue
                total = sum(len(c.get("concepts", [])) for c in categories)
                if total < 3:
                    last_error = f"Only {total} total concept(s) across categories, need at least 3"
                    continue
                log.info(f"[Step 1] Extracted {total} concepts in {len(categories)} categories for '{topic}' (attempt {attempt})")
                return {"topic": topic, "categories": categories}

            # Fallback: flat list → wrap in single category
            if "concepts" in data:
                concepts = [str(c).strip() for c in data["concepts"] if str(c).strip()]
                if len(concepts) < 3:
                    last_error = f"Only {len(concepts)} concept(s) returned, need at least 3"
                    continue
                log.info(f"[Step 1] Extracted {len(concepts)} concepts (flat) for '{topic}' (attempt {attempt})")
                return {"topic": topic, "categories": [{"name": topic, "concepts": concepts}]}

            last_error = "Neither 'categories' nor 'concepts' key found in response"

        log.error(f"[Step 1] Failed after {MAX_RETRIES} attempts for '{topic}'")
        return {"topic": topic, "categories": []}

    # ── Step 3 ────────────────────────────────────────────────────────────────

    async def generate_quiz(
        self,
        topic: str,
        selected_concepts: list,
        total_questions: int,
        image_questions_count: int,
        language: str = "English",
        seed: str = "",
    ) -> list:
        """
        Step 3: Generate, validate and return quiz questions.

        - Auto-caps image_questions_count to total_questions.
        - Retries up to MAX_RETRIES with targeted error feedback.
        - Validates + auto-fixes questions via QuizValidator.
        - Accepts partial result if ≥ PARTIAL_THRESHOLD of questions are valid.

        Returns:
            list of validated question dicts (may be shorter than total_questions
            if LLM repeatedly fails to produce enough valid questions)
        """
        # Auto-cap
        image_questions_count = min(image_questions_count, total_questions)
        text_count            = total_questions - image_questions_count

        last_error      = ""
        best_questions  = []  # best result across all attempts

        for attempt in range(1, MAX_RETRIES + 1):
            if attempt == 1:
                prompt = _STEP3_PROMPT.format(
                    topic=topic,
                    selected_concepts=json.dumps(selected_concepts, ensure_ascii=False),
                    total_questions=total_questions,
                    image_count=image_questions_count,
                    text_count=text_count,
                    language=language,
                )
                # Append seed as a hidden comment to bust the LLM cache on regeneration
                if seed:
                    prompt += f"\n\n# generation-id: {seed}"
            else:
                log.warning(f"[Step 3] Retry {attempt}/{MAX_RETRIES} — {last_error}")
                prompt = _STEP3_RETRY_PROMPT.format(
                    topic=topic,
                    selected_concepts=json.dumps(selected_concepts, ensure_ascii=False),
                    total_questions=total_questions,
                    image_count=image_questions_count,
                    text_count=text_count,
                    error=last_error,
                    language=language,
                )

            raw  = await self.llm.generate_async("", [], prompt_override=prompt)
            data = parse_json_safe(raw)

            if not data:
                last_error = f"Response is not valid JSON. Got: {raw[:150]!r}"
                continue

            # Accept both {"questions": [...]} and bare [...]
            if isinstance(data, list):
                raw_questions = data
            elif isinstance(data, dict):
                raw_questions = data.get("questions", [])
            else:
                last_error = f"Unexpected JSON type: {type(data).__name__}"
                continue

            if not raw_questions:
                last_error = "Questions array is empty"
                continue

            # Validate + fix
            report    = self.validator.validate_and_fix(raw_questions, selected_concepts)
            questions = report["questions"]

            if report["issues"]:
                for issue in report["issues"][:5]:
                    log.debug(f"  Validator: {issue}")

            # Track best result
            if len(questions) > len(best_questions):
                best_questions = questions

            actual_total = len(questions)
            actual_image = sum(1 for q in questions if q.get("type") == "image")

            # Perfect result — return immediately
            if actual_total >= total_questions:
                log.info(
                    f"[Step 3] Generated {actual_total} questions "
                    f"({actual_image} image, {actual_total - actual_image} text) "
                    f"[attempt {attempt}]"
                )
                return questions[:total_questions]

            # Build specific error for next retry
            issues = []
            if actual_total < total_questions:
                issues.append(
                    f"got {actual_total} valid questions but need {total_questions} "
                    f"(dropped {report['dropped_count']} invalid ones)"
                )
            if actual_image != image_questions_count:
                issues.append(
                    f"image question count is {actual_image}, expected {image_questions_count}"
                )
            last_error = "; ".join(issues) if issues else "unknown validation error"

        # Exhausted retries — use best result if it meets the partial threshold
        threshold = int(total_questions * PARTIAL_THRESHOLD)
        if len(best_questions) >= max(1, threshold):
            log.warning(
                f"[Step 3] Accepted partial quiz: {len(best_questions)}/{total_questions} "
                f"questions after {MAX_RETRIES} attempts"
            )
            return best_questions

        log.error(f"[Step 3] Quiz generation failed after {MAX_RETRIES} attempts for '{topic}'")
        return best_questions  # return whatever we have (could be [])

    # ── Sync wrappers (for non-async callers, e.g. FastAPI background tasks) ─

    def extract_concepts_sync(self, topic: str, language: str = "English") -> dict:
        return asyncio.run(self.extract_concepts(topic, language))

    def generate_quiz_sync(
        self,
        topic: str,
        selected_concepts: list,
        total_questions: int,
        image_questions_count: int,
        language: str = "English",
        seed: str = "",
    ) -> list:
        return asyncio.run(
            self.generate_quiz(topic, selected_concepts, total_questions, image_questions_count, language, seed)
        )
