"""
exam_engine.py — AI-powered exam generator
==========================================
Handles:
  - Topic suggestions (debounced autocomplete)
  - Full exam generation from prompt (MCQ, True/False, Problem Solving, Case Study)
  - LLM-based grading for free-text answers
"""

import json
import logging
import re
import uuid

from modules.doc_generation.llm import LLMEngine

log = logging.getLogger("exam.engine")


class ExamEngine:
    def __init__(self, llm_engine=None):
        self.llm = llm_engine or LLMEngine()

    # ─────────────────────────────────────────────────────────────────────────
    # SUGGESTIONS
    # ─────────────────────────────────────────────────────────────────────────

    async def get_focus_suggestions(self, topic: str, q: str = "") -> list[str]:
        """Return specific subtopics/focus areas for a given topic."""
        extra = f' The student has typed "{q}" as a partial focus.' if q.strip() else ""
        prompt = (
            f'A student wants to create an exam on "{topic}".{extra}\n\n'
            f"List exactly 8 specific subtopics or focus areas within \"{topic}\" that are commonly tested at university level.\n"
            "Return ONLY a JSON array of 8 short strings (2-5 words each). No markdown, no explanation.\n"
            f'Example for SQL: ["SELECT Statement", "WHERE Clause", "JOINs", "GROUP BY", "Subqueries", "Indexes", "Aggregate Functions", "Foreign Keys"]'
        )
        raw = await self.llm.generate_async("", [], prompt_override=prompt)
        return self._parse_string_list(raw, limit=8)

    async def get_suggestions(self, query: str) -> list[str]:
        """Return 5 specific exam topic suggestions related to the query."""
        prompt = (
            f'A student is typing an exam topic. Partial input: "{query}"\n\n'
            "Suggest exactly 5 specific, university-level exam topics related to this input.\n"
            "Return ONLY a JSON array of 5 strings. No markdown, no explanation.\n"
            'Example: ["Linear Regression Analysis", "Gradient Descent Optimization", '
            '"Overfitting and Regularization Techniques", "Convolutional Neural Networks", '
            '"K-Means Clustering Algorithm"]'
        )
        raw = await self.llm.generate_async("", [], prompt_override=prompt)
        return self._parse_string_list(raw, limit=5)

    # ─────────────────────────────────────────────────────────────────────────
    # EXAM GENERATION
    # ─────────────────────────────────────────────────────────────────────────

    async def generate_exam(
        self,
        topic: str,
        focus: str,
        difficulty: str,
        mix: dict,
        language: str,
    ) -> dict:
        """Generate a complete structured exam."""

        parts = []
        if mix.get("mcq", 0):
            parts.append(f"{mix['mcq']} MCQ (4 options A/B/C/D, exactly one correct)")
        if mix.get("truefalse", 0):
            parts.append(f"{mix['truefalse']} True/False questions")
        if mix.get("problem", 0):
            parts.append(f"{mix['problem']} Problem Solving questions (open free-text answer)")
        if mix.get("casestudy", 0):
            parts.append(
                f"{mix['casestudy']} Case Study questions "
                "(realistic scenario + data table with ≥3 rows + 3 sub-questions each)"
            )

        diff_hint = {
            "Easy":   "straightforward definitions and basic recall",
            "Medium": "application and understanding, some calculation",
            "Hard":   "analysis, synthesis, multi-step problems and critical thinking",
        }.get(difficulty, "medium difficulty")

        focus_line = f" with specific focus on: {focus}" if focus else ""

        prompt = f"""You are an expert university professor creating a {difficulty} exam on "{topic}"{focus_line}.
All text must be in {language}.
Difficulty guide: {diff_hint}.

Generate EXACTLY:
{chr(10).join(f"  - {p}" for p in parts)}

Return ONLY valid JSON with this exact structure (no markdown, no explanation):
{{
  "title": "descriptive exam title",
  "questions": [

    // ── MCQ example ──
    {{
      "id": 1,
      "type": "mcq",
      "question": "question text",
      "options": ["A) ...", "B) ...", "C) ...", "D) ..."],
      "correct": 0,
      "explanation": "why the correct answer is right"
    }},

    // ── True/False example ──
    {{
      "id": 2,
      "type": "truefalse",
      "question": "a statement to evaluate as true or false",
      "correct": true,
      "explanation": "explanation of why it is true or false"
    }},

    // ── Problem Solving example ──
    {{
      "id": 3,
      "type": "problem",
      "question": "detailed problem description — be specific and educational",
      "model_answer": "complete expected answer",
      "key_points": ["key concept 1", "key concept 2", "key concept 3"]
    }},

    // ── Case Study example ──
    {{
      "id": 4,
      "type": "casestudy",
      "context": "realistic real-world scenario description (2-3 sentences)",
      "table": {{
        "headers": ["Column1", "Column2", "Column3"],
        "rows": [
          ["val1", "val2", "val3"],
          ["val4", "val5", "val6"],
          ["val7", "val8", "val9"]
        ]
      }},
      "subquestions": [
        {{"id": "4a", "question": "first sub-question", "model_answer": "expected answer", "points": 4}},
        {{"id": "4b", "question": "second sub-question", "model_answer": "expected answer", "points": 3}},
        {{"id": "4c", "question": "third sub-question", "model_answer": "expected answer", "points": 3}}
      ]
    }}

  ]
}}

IMPORTANT:
- Generate EXACTLY the number of questions requested for each type
- The "correct" field for MCQ is the 0-based index of the correct option
- All content must be accurate and genuinely educational
- Case study table must have at least 3 data rows and meaningful column names
- Make sub-question points sum to 10 per case study
"""

        raw = await self.llm.generate_async("", [], prompt_override=prompt)
        data = _parse_json(raw)
        if not data or "questions" not in data:
            log.error(f"Failed to parse exam JSON. Raw:\n{raw[:500]}")
            raise ValueError("LLM did not return valid exam JSON")

        data["topic"]      = topic
        data["difficulty"] = difficulty
        data["language"]   = language
        data["id"]         = uuid.uuid4().hex[:8]
        return data

    # ─────────────────────────────────────────────────────────────────────────
    # GRADING
    # ─────────────────────────────────────────────────────────────────────────

    async def grade_answer(
        self,
        question: dict,
        student_answer: str,
        language: str = "English",
    ) -> dict:
        """Grade a free-text answer with LLM. Returns score + feedback."""
        q_type = question.get("type")

        if q_type == "problem":
            prompt = f"""You are a university professor grading a student's answer.

Question: {question['question']}
Model Answer: {question.get('model_answer', '')}
Key Points expected: {', '.join(question.get('key_points', []))}

Student's Answer:
{student_answer}

Score the answer out of 10 and give constructive feedback in {language}.
Return ONLY JSON:
{{
  "score": <integer 0-10>,
  "max_score": 10,
  "feedback": "constructive feedback paragraph",
  "correct_points": ["point student covered correctly"],
  "missing_points": ["important points student missed"]
}}"""

        elif q_type == "casestudy":
            subq = question.get("current_subquestion", {})
            max_pts = subq.get("points", 5)
            prompt = f"""You are grading a case study sub-question answer.

Case Context: {question.get('context', '')}
Sub-question: {subq.get('question', '')}
Model Answer: {subq.get('model_answer', '')}
Max points: {max_pts}

Student's Answer:
{student_answer}

Return ONLY JSON:
{{
  "score": <integer 0-{max_pts}>,
  "max_score": {max_pts},
  "feedback": "feedback in {language}",
  "correct_points": ["what student got right"],
  "missing_points": ["what student missed"]
}}"""

        else:
            return {"score": 0, "max_score": 10, "feedback": "Unsupported question type for grading"}

        raw = await self.llm.generate_async("", [], prompt_override=prompt)
        result = _parse_json(raw)
        if result and "score" in result:
            return result
        return {"score": 0, "max_score": 10, "feedback": "Grading unavailable — review manually"}

    # ─────────────────────────────────────────────────────────────────────────
    # HELPERS
    # ─────────────────────────────────────────────────────────────────────────

    def _parse_string_list(self, raw: str, limit: int = 5) -> list[str]:
        raw = raw.strip()
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw).strip()
        try:
            data = json.loads(raw)
            if isinstance(data, list):
                return [str(s) for s in data[:limit]]
        except Exception:
            pass
        items = re.findall(r'"([^"]{3,})"', raw)
        return items[:limit]


def _parse_json(raw: str) -> dict | None:
    """Robust JSON extractor — strips fences, finds first {...} block."""
    raw = raw.strip()
    raw = re.sub(r"^```(?:json)?\s*", "", raw)
    raw = re.sub(r"\s*```$", "", raw).strip()
    try:
        return json.loads(raw)
    except Exception:
        pass
    match = re.search(r"\{[\s\S]*\}", raw)
    if match:
        try:
            return json.loads(match.group(0))
        except Exception:
            pass
    return None
