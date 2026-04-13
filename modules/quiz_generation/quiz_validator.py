"""
quiz_validator.py — Structural validation + auto-fix for generated questions
=============================================================================
Validates that each question meets the strict format spec and auto-fixes the
most common LLM output issues (wrong option count, invalid enum values, missing
fields that can be inferred) before questions reach the consumer.

Any question that cannot be repaired is dropped and logged.
"""

import logging
from typing import Any

log = logging.getLogger("quiz.validator")

# ─────────────────────────────────────────────────────────────────────────────
# CONSTANTS
# ─────────────────────────────────────────────────────────────────────────────

VALID_TYPES        = {"text", "image"}
VALID_FORMATS      = {"mcq", "true_false", "short_answer"}
VALID_DIFFICULTIES = {"easy", "medium", "hard"}

# Aliases produced by LLMs that deviate from the spec
FORMAT_ALIASES = {
    "multiple_choice":    "mcq",
    "multiple choice":    "mcq",
    "multiple-choice":    "mcq",
    "true/false":         "true_false",
    "true-false":         "true_false",
    "tf":                 "true_false",
    "t/f":                "true_false",
    "open":               "short_answer",
    "open_answer":        "short_answer",
    "open answer":        "short_answer",
    "fill_in_the_blank":  "short_answer",
    "fill in the blank":  "short_answer",
    "free_text":          "short_answer",
    "free text":          "short_answer",
}

DIFFICULTY_ALIASES = {
    "simple":      "easy",
    "beginner":    "easy",
    "basic":       "easy",
    "intermediate":"medium",
    "moderate":    "medium",
    "difficult":   "hard",
    "advanced":    "hard",
    "complex":     "hard",
}


# ─────────────────────────────────────────────────────────────────────────────
# QUIZ VALIDATOR
# ─────────────────────────────────────────────────────────────────────────────

class QuizValidator:
    """
    Validates and auto-fixes a list of quiz question dicts.

    Usage:
        validator = QuizValidator()
        result    = validator.validate_and_fix(questions, selected_concepts)

        result["questions"]      → list of fixed, valid questions
        result["issues"]         → list of human-readable issue strings
        result["original_count"] → int
        result["fixed_count"]    → int
        result["dropped_count"]  → int
        result["stats"]          → distribution stats dict
    """

    def validate_and_fix(
        self,
        questions: list,
        selected_concepts: list = None,
    ) -> dict:
        """
        Validate and auto-fix a raw list of question dicts from the LLM.

        Args:
            questions         : raw list from the LLM
            selected_concepts : the concepts the teacher selected (for concept check)
        """
        if not isinstance(questions, list):
            log.error("QuizValidator received non-list input")
            return {
                "questions": [], "issues": ["Input is not a list"],
                "original_count": 0, "fixed_count": 0,
                "dropped_count": 0, "stats": {},
            }

        sc         = selected_concepts or []
        fixed      = []
        issues_all = []

        for idx, q in enumerate(questions):
            q_num = idx + 1
            q_fixed, q_issues = self._fix_question(q, q_num, sc)
            issues_all.extend(q_issues)
            if q_fixed is not None:
                fixed.append(q_fixed)

        stats = self._compute_stats(fixed)

        return {
            "questions":      fixed,
            "issues":         issues_all,
            "original_count": len(questions),
            "fixed_count":    len(fixed),
            "dropped_count":  len(questions) - len(fixed),
            "stats":          stats,
        }

    # ─────────────────────────────────────────────────────────────────────────
    # PER-QUESTION FIXER
    # ─────────────────────────────────────────────────────────────────────────

    def _fix_question(self, q: Any, q_num: int, selected_concepts: list):
        """
        Attempt to fix one question dict.
        Returns (fixed_dict, issues_list) or (None, issues_list) if unfixable.
        """
        issues = []

        if not isinstance(q, dict):
            return None, [f"Q{q_num}: not a dict — dropped"]

        q = dict(q)  # shallow copy — don't mutate the original

        # ── type ──────────────────────────────────────────────────────────────
        q_type = str(q.get("type", "text")).lower().strip()
        if q_type not in VALID_TYPES:
            q_type = "text"
            issues.append(f"Q{q_num}: invalid type → defaulted to 'text'")
        q["type"] = q_type

        # ── format (text questions only) ──────────────────────────────────────
        if q_type == "text":
            fmt = str(q.get("format", "")).lower().strip()
            fmt = FORMAT_ALIASES.get(fmt, fmt)
            if fmt not in VALID_FORMATS:
                fmt = self._infer_format(q)
                issues.append(f"Q{q_num}: invalid/missing format → inferred as '{fmt}'")
            q["format"] = fmt
        elif q_type == "image":
            # Image questions may carry a format hint for the frontend
            fmt = str(q.get("format", "")).lower().strip()
            fmt = FORMAT_ALIASES.get(fmt, fmt)
            if fmt not in VALID_FORMATS:
                # Default image question to MCQ if it has 4 options, else leave unset
                opts = q.get("options", [])
                if isinstance(opts, list) and len(opts) == 4:
                    fmt = "mcq"
                else:
                    fmt = "mcq"   # safe default
            q["format"] = fmt

        # ── difficulty ────────────────────────────────────────────────────────
        raw_diff = str(q.get("difficulty", "")).lower().strip()
        diff     = DIFFICULTY_ALIASES.get(raw_diff, raw_diff)
        if diff not in VALID_DIFFICULTIES:
            q["difficulty"] = "medium"
            issues.append(f"Q{q_num}: invalid difficulty '{raw_diff}' → defaulted to 'medium'")
        else:
            q["difficulty"] = diff

        # ── options ───────────────────────────────────────────────────────────
        fmt = q.get("format", "")

        if fmt == "true_false":
            # Always overwrite — ensure canonical ["True", "False"]
            q["options"] = ["True", "False"]

        elif fmt == "mcq":
            opts = q.get("options", [])
            if not isinstance(opts, list):
                opts = []
            opts = [str(o).strip() for o in opts if str(o).strip()]
            if len(opts) < 2:
                # unfixable — no usable options
                return None, issues + [f"Q{q_num}: MCQ has fewer than 2 options → dropped"]
            if len(opts) != 4:
                issues.append(f"Q{q_num}: MCQ has {len(opts)} option(s), expected 4 — keeping")
            q["options"] = opts

        else:
            # short_answer or image — keep options if they exist, clean them
            opts = q.get("options", [])
            if isinstance(opts, list) and opts:
                q["options"] = [str(o).strip() for o in opts if str(o).strip()]

        # ── answer normalization ──────────────────────────────────────────────
        answer = str(q.get("answer", "")).strip()
        if not answer:
            return None, issues + [f"Q{q_num}: missing answer → dropped"]
        q["answer"] = answer

        # ── question text ─────────────────────────────────────────────────────
        question_text = str(q.get("question", "")).strip()
        if not question_text:
            return None, issues + [f"Q{q_num}: missing question text → dropped"]
        q["question"] = question_text

        # ── concept ───────────────────────────────────────────────────────────
        concept = str(q.get("concept", "")).strip()
        if not concept:
            return None, issues + [f"Q{q_num}: missing concept → dropped"]
        q["concept"] = concept

        if selected_concepts and concept not in selected_concepts:
            issues.append(
                f"Q{q_num}: concept '{concept}' not in selected list — keeping"
            )

        # ── image_prompt (image questions) ────────────────────────────────────
        if q_type == "image":
            img_prompt = str(q.get("image_prompt", "")).strip()
            if not img_prompt:
                issues.append(f"Q{q_num}: image question is missing 'image_prompt'")
                q["image_prompt"] = f"Educational diagram illustrating {concept}"
            else:
                q["image_prompt"] = img_prompt

        # ── True/False answer normalization ───────────────────────────────────
        if fmt == "true_false":
            ans_lower = q["answer"].lower()
            if ans_lower in ("true", "yes", "correct", "1"):
                q["answer"] = "True"
            elif ans_lower in ("false", "no", "incorrect", "0"):
                q["answer"] = "False"
            # else: keep as-is and let teacher verify

        return q, issues

    # ─────────────────────────────────────────────────────────────────────────
    # HELPERS
    # ─────────────────────────────────────────────────────────────────────────

    @staticmethod
    def _infer_format(q: dict) -> str:
        """Infer the question format from its options when format field is absent."""
        opts = q.get("options", [])
        if isinstance(opts, list):
            if len(opts) == 4:
                return "mcq"
            if len(opts) == 2:
                low = [str(o).strip().lower() for o in opts]
                if "true" in low and "false" in low:
                    return "true_false"
        return "short_answer"

    @staticmethod
    def _compute_stats(questions: list) -> dict:
        """Compute distribution statistics across a validated question list."""
        if not questions:
            return {}

        difficulty_dist = {"easy": 0, "medium": 0, "hard": 0}
        format_dist     = {"mcq": 0, "true_false": 0, "short_answer": 0}
        type_dist       = {"text": 0, "image": 0}
        concepts_seen   = {}

        for q in questions:
            diff  = q.get("difficulty", "medium")
            fmt   = q.get("format", "")
            qtype = q.get("type", "text")
            c     = q.get("concept", "")

            difficulty_dist[diff]  = difficulty_dist.get(diff, 0) + 1
            format_dist[fmt]       = format_dist.get(fmt, 0) + 1
            type_dist[qtype]       = type_dist.get(qtype, 0) + 1
            concepts_seen[c]       = concepts_seen.get(c, 0) + 1

        total = len(questions)
        return {
            "total":             total,
            "type_dist":         type_dist,
            "format_dist":       format_dist,
            "difficulty_dist":   difficulty_dist,
            "difficulty_pct":    {
                k: round(v / total * 100, 1) for k, v in difficulty_dist.items()
            },
            "concepts_covered":  sorted(concepts_seen.keys()),
            "questions_per_concept": dict(sorted(concepts_seen.items())),
        }
