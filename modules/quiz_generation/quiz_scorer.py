"""
quiz_scorer.py — Smart quiz grading engine
==========================================
Two scoring strategies, chosen automatically per question type:

  • Exact match    → MCQ, True/False, image questions
                     Simple case-insensitive string comparison
                     Score: 1.0 (correct) or 0.0 (wrong)

  • Semantic score → Short Answer questions
                     LLM evaluates whether the student's answer captures
                     the essential meaning (partial credit: 0.0 – 1.0)
                     Falls back to exact match if no LLM is available

Output: a full report dict with per-question results, per-concept and
        per-difficulty breakdowns, grade, and a plain-language summary.
"""

import asyncio
import json
import logging
import re
from typing import Union

from modules.doc_generation.llm import LLMEngine

log = logging.getLogger("quiz.scorer")


# ─────────────────────────────────────────────────────────────────────────────
# SEMANTIC GRADING PROMPT
# ─────────────────────────────────────────────────────────────────────────────

_SEMANTIC_PROMPT = """\
You are a strict but fair teacher grading a student's short-answer response.

Question       : {question}
Correct Answer : {correct_answer}
Student Answer : {student_answer}

Evaluation criteria:
  1.0  — Fully correct: captures the essential meaning of the correct answer
  0.5  — Partially correct: core concept present but incomplete or imprecise
  0.0  — Incorrect: misses the point or is blank

Be strict. A vague answer that uses relevant words but lacks understanding = 0.0.

Return ONLY a valid JSON object — no markdown, no explanation:
{{
  "is_correct": true or false,
  "score": 0.0 to 1.0,
  "feedback": "one clear sentence explaining the grade"
}}"""


# ─────────────────────────────────────────────────────────────────────────────
# INTERNAL HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def _parse_score_response(raw: str) -> dict | None:
    """Extract score JSON from LLM response (handles markdown fences + bare JSON)."""
    raw = raw.strip()
    for extractor in [
        lambda r: json.loads(r),
        lambda r: json.loads(re.search(r"\{[\s\S]*?\}", r).group()),
    ]:
        try:
            return extractor(raw)
        except Exception:
            pass
    return None


def _normalize_answer(ans: str) -> str:
    """Lowercase + strip for case-insensitive exact matching."""
    return ans.strip().lower()


# ─────────────────────────────────────────────────────────────────────────────
# QUIZ SCORER
# ─────────────────────────────────────────────────────────────────────────────

class QuizScorer:
    """
    Grade a completed quiz and generate a full performance report.

    Usage:
        scorer = QuizScorer(llm_engine=gen.llm)   # share the LLM instance

        # student_answers can be a list (same order as questions) or a dict
        report = await scorer.score_quiz(questions, student_answers)

        # Key report fields:
        report["percentage"]      # e.g. 80.0
        report["grade"]           # "A" | "B" | "C" | "D" | "F"
        report["summary"]         # human-readable summary string
        report["per_concept"]     # {concept: {total, correct, percentage}}
        report["per_difficulty"]  # {easy|medium|hard: {total, correct, percentage}}
        report["results"]         # per-question detail list

    Sync usage:
        report = scorer.score_quiz_sync(questions, student_answers)
    """

    def __init__(self, llm_engine: LLMEngine = None):
        self.llm = llm_engine  # optional — only used for short-answer scoring

    # ── Public API ────────────────────────────────────────────────────────────

    async def score_quiz(
        self,
        questions: list,
        student_answers: Union[list, dict],
    ) -> dict:
        """
        Grade all questions and return a full performance report.

        Args:
            questions       : list of question dicts (output of generate_quiz)
            student_answers : list[str] indexed by position,
                              OR dict {int|str → str} keyed by question index
        Returns:
            Full report dict (see class docstring for structure)
        """
        results = []
        for i, q in enumerate(questions):
            s_ans = self._get_student_answer(student_answers, i)
            result = await self._grade_one(q, s_ans, i)
            results.append(result)

        return self._build_report(results)

    def score_quiz_sync(
        self,
        questions: list,
        student_answers: Union[list, dict],
    ) -> dict:
        """Synchronous wrapper around score_quiz."""
        return asyncio.run(self.score_quiz(questions, student_answers))

    # ── Single-question grader ────────────────────────────────────────────────

    async def _grade_one(self, q: dict, student_ans: str, idx: int) -> dict:
        fmt    = q.get("format", "short_answer").lower()
        q_type = q.get("type", "text").lower()

        # Choose strategy
        if fmt in ("mcq", "true_false") or q_type == "image":
            scored = self._score_exact(q, student_ans)
        else:
            # short_answer: try semantic, fall back to exact
            scored = await self._score_semantic(q, student_ans)

        return {
            "index":          idx,
            "question":       q.get("question", ""),
            "concept":        q.get("concept", ""),
            "difficulty":     q.get("difficulty", "medium"),
            "format":         fmt,
            "type":           q_type,
            "correct_answer": q.get("answer", ""),
            "student_answer": student_ans,
            **scored,
        }

    # ── Scoring strategies ────────────────────────────────────────────────────

    def _score_exact(self, q: dict, student_ans: str) -> dict:
        """Case-insensitive exact match (MCQ, True/False, image)."""
        correct    = _normalize_answer(q.get("answer", ""))
        given      = _normalize_answer(student_ans)
        is_correct = correct == given
        return {
            "is_correct": is_correct,
            "score":      1.0 if is_correct else 0.0,
            "feedback":   "Correct!" if is_correct
                          else f"Incorrect. Correct answer: {q.get('answer', '')}",
            "method":     "exact",
        }

    async def _score_semantic(self, q: dict, student_ans: str) -> dict:
        """LLM-based semantic grading for short-answer questions."""
        if not student_ans.strip():
            return {
                "is_correct": False,
                "score":      0.0,
                "feedback":   "No answer provided.",
                "method":     "exact",
            }

        if not self.llm:
            log.debug("No LLM available for semantic scoring — falling back to exact match")
            return {**self._score_exact(q, student_ans), "method": "exact_fallback"}

        prompt = _SEMANTIC_PROMPT.format(
            question=q.get("question", ""),
            correct_answer=q.get("answer", ""),
            student_answer=student_ans,
        )

        try:
            raw    = await self.llm.generate_async("", [], prompt_override=prompt)
            parsed = _parse_score_response(raw)
            if parsed:
                score = max(0.0, min(1.0, float(parsed.get("score", 0.0))))
                return {
                    "is_correct": bool(parsed.get("is_correct", score >= 0.5)),
                    "score":      score,
                    "feedback":   str(parsed.get("feedback", "")),
                    "method":     "semantic",
                }
        except Exception as exc:
            log.warning(f"Semantic scoring error: {exc} — falling back to exact match")

        return {**self._score_exact(q, student_ans), "method": "exact_fallback"}

    # ── Report builder ────────────────────────────────────────────────────────

    def _build_report(self, results: list) -> dict:
        total       = len(results)
        total_score = sum(r["score"] for r in results)
        correct_cnt = sum(1 for r in results if r["is_correct"])

        # ── Per-concept breakdown ──────────────────────────────────────────
        by_concept: dict = {}
        for r in results:
            c = r["concept"]
            if c not in by_concept:
                by_concept[c] = {"total": 0, "correct": 0, "score": 0.0}
            by_concept[c]["total"]   += 1
            by_concept[c]["correct"] += int(r["is_correct"])
            by_concept[c]["score"]   += r["score"]

        for c, d in by_concept.items():
            d["percentage"] = round(d["score"] / d["total"] * 100, 1) if d["total"] else 0.0
            d["score"]      = round(d["score"], 2)

        # ── Per-difficulty breakdown ───────────────────────────────────────
        by_difficulty: dict = {}
        for r in results:
            d = r["difficulty"]
            if d not in by_difficulty:
                by_difficulty[d] = {"total": 0, "correct": 0}
            by_difficulty[d]["total"]   += 1
            by_difficulty[d]["correct"] += int(r["is_correct"])

        for d, v in by_difficulty.items():
            v["percentage"] = round(v["correct"] / v["total"] * 100, 1) if v["total"] else 0.0

        # ── Per-format breakdown ───────────────────────────────────────────
        by_format: dict = {}
        for r in results:
            f = r["format"]
            if f not in by_format:
                by_format[f] = {"total": 0, "correct": 0}
            by_format[f]["total"]   += 1
            by_format[f]["correct"] += int(r["is_correct"])

        # ── Weak concepts (< 60%) ──────────────────────────────────────────
        weak_concepts = [
            c for c, d in by_concept.items() if d["percentage"] < 60.0
        ]

        ratio      = total_score / total if total else 0.0
        percentage = round(ratio * 100, 1)
        grade      = self._compute_grade(ratio)

        return {
            "total_questions":  total,
            "correct_answers":  correct_cnt,
            "total_score":      round(total_score, 2),
            "percentage":       percentage,
            "grade":            grade,
            "summary":          self._summary_text(percentage, correct_cnt, total, grade),
            "weak_concepts":    weak_concepts,
            "per_concept":      by_concept,
            "per_difficulty":   by_difficulty,
            "per_format":       by_format,
            "results":          results,
        }

    # ─────────────────────────────────────────────────────────────────────────
    # STATIC HELPERS
    # ─────────────────────────────────────────────────────────────────────────

    @staticmethod
    def _get_student_answer(student_answers: Union[list, dict], idx: int) -> str:
        """Safely retrieve the student answer for question at index idx."""
        if isinstance(student_answers, list):
            return str(student_answers[idx]) if idx < len(student_answers) else ""
        # dict: try int key, then string key
        return str(
            student_answers.get(idx, student_answers.get(str(idx), ""))
        )

    @staticmethod
    def _compute_grade(ratio: float) -> str:
        if ratio >= 0.90: return "A"
        if ratio >= 0.80: return "B"
        if ratio >= 0.70: return "C"
        if ratio >= 0.60: return "D"
        return "F"

    @staticmethod
    def _summary_text(pct: float, correct: int, total: int, grade: str) -> str:
        messages = {
            "A": "Excellent work! Keep it up.",
            "B": "Good job! A bit more practice and you'll master it.",
            "C": "Satisfactory. Review the weak concepts to improve.",
            "D": "Needs improvement. Revisit the material and try again.",
            "F": "Please review the material carefully before retrying.",
        }
        return f"{correct}/{total} correct ({pct}%) — Grade {grade}. {messages[grade]}"
