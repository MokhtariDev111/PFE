"""
exam_engine.py — AI-powered exam generator
==========================================
Uses a 3-agent sequential pipeline for high-quality output:
  1. Planner  — decides what concepts to test and how many of each type
  2. Writer   — writes full questions based on the plan
  3. Reviewer — fixes quality issues and validates the final JSON

Also handles:
  - Topic suggestions (debounced autocomplete)
  - Focus suggestions (subtopic chips)
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
    # EXAM GENERATION  (3-agent pipeline)
    # ─────────────────────────────────────────────────────────────────────────

    async def generate_exam(
        self,
        topic: str,
        focus: str,
        difficulty: str,
        mix: dict,
        language: str,
    ) -> dict:
        """
        Generate a complete structured exam using a 3-step agent pipeline:
          Step 1 — Planner:  decide which specific concepts to test
          Step 2 — Writer:   write all questions from the plan
          Step 3 — Reviewer: validate quality and fix any issues
        """
        log.info(f"[ExamEngine] Starting 3-agent pipeline: topic={topic!r}, difficulty={difficulty}")

        # ── Step 1: Planner ───────────────────────────────────────────────────
        plan = await self._run_planner(topic, focus, difficulty, mix, language)
        log.info(f"[ExamEngine] Plan ready: {len(plan.get('concepts', []))} concepts")

        # ── Step 2: Writer ────────────────────────────────────────────────────
        draft = await self._run_writer(topic, focus, difficulty, mix, language, plan)
        log.info(f"[ExamEngine] Draft ready: {len(draft.get('questions', []))} questions")

        # ── Step 3: Reviewer ──────────────────────────────────────────────────
        final = await self._run_reviewer(topic, difficulty, language, mix, draft)
        log.info(f"[ExamEngine] Review done: {len(final.get('questions', []))} questions finalised")

        if not final or "questions" not in final:
            raise ValueError("Pipeline failed to produce valid exam JSON")

        final["topic"]      = topic
        final["difficulty"] = difficulty
        final["language"]   = language
        final["id"]         = uuid.uuid4().hex[:8]
        return final

    # ── Agent 1: Planner ──────────────────────────────────────────────────────

    async def _run_planner(
        self,
        topic: str,
        focus: str,
        difficulty: str,
        mix: dict,
        language: str,
    ) -> dict:
        """
        Produces a question-by-question outline: concept to test, question type,
        and the core idea. No full questions yet — just intent.
        """
        focus_line = f"Focus areas: {focus}." if focus else ""
        parts = []
        if mix.get("mcq"):       parts.append(f"{mix['mcq']} MCQ")
        if mix.get("truefalse"): parts.append(f"{mix['truefalse']} True/False")
        if mix.get("problem"):   parts.append(f"{mix['problem']} Problem Solving")
        if mix.get("casestudy"): parts.append(f"{mix['casestudy']} Case Study")

        diff_hint = {
            "Easy":   "basic recall and definitions",
            "Medium": "application and understanding, some calculation",
            "Hard":   "analysis, synthesis, multi-step and critical thinking",
        }.get(difficulty, "medium difficulty")

        prompt = f"""You are an expert university professor planning a {difficulty} exam on "{topic}".
{focus_line}
Difficulty guide: {diff_hint}.
Language: {language}.

You need to create: {', '.join(parts)}.

Your task: produce a PLAN — for each question, decide:
- Which specific concept or subtopic to test (be precise, not generic)
- The question type
- One sentence describing the core idea of the question

Return ONLY valid JSON:
{{
  "exam_title": "descriptive title",
  "concepts": [
    {{"index": 1, "type": "mcq",       "concept": "specific concept", "idea": "one sentence question intent"}},
    {{"index": 2, "type": "truefalse", "concept": "specific concept", "idea": "one sentence statement idea"}},
    {{"index": 3, "type": "problem",   "concept": "specific concept", "idea": "one sentence problem description"}},
    {{"index": 4, "type": "casestudy", "concept": "specific concept", "idea": "one sentence scenario idea"}}
  ]
}}

Rules:
- Cover DIFFERENT concepts — no repetition across questions
- Be specific: "Gradient Descent learning rate effect" not just "Machine Learning"
- Total concepts must match exactly: {sum(mix.values())} questions
- Types must match: {', '.join(parts)}
"""
        raw = await self.llm.generate_async("", [], prompt_override=prompt)
        plan = _parse_json(raw)
        if not plan or "concepts" not in plan:
            log.warning("[Planner] Failed to parse plan, using fallback empty plan")
            plan = {"exam_title": f"{topic} Exam", "concepts": []}
        return plan

    # ── Agent 2: Writer ───────────────────────────────────────────────────────

    async def _run_writer(
        self,
        topic: str,
        focus: str,
        difficulty: str,
        mix: dict,
        language: str,
        plan: dict,
    ) -> dict:
        """
        Takes the planner's outline and writes full, detailed questions.
        Each question is grounded in a specific concept from the plan.
        """
        concepts_text = "\n".join(
            f"  Q{c['index']} ({c['type']}): concept={c['concept']!r}, idea={c['idea']!r}"
            for c in plan.get("concepts", [])
        )

        diff_hint = {
            "Easy":   "straightforward definitions and basic recall",
            "Medium": "application and understanding, some calculation",
            "Hard":   "analysis, synthesis, multi-step problems and critical thinking",
        }.get(difficulty, "medium difficulty")

        prompt = f"""You are an expert university professor writing exam questions on "{topic}".
Difficulty: {difficulty} — {diff_hint}.
Language: {language}.

The planner has decided what to test. Your job is to write complete, high-quality questions
for each item in this plan:

{concepts_text}

Return ONLY valid JSON:
{{
  "title": "{plan.get('exam_title', topic + ' Exam')}",
  "questions": [

    // MCQ format:
    {{
      "id": 1,
      "type": "mcq",
      "question": "precise, educational question text",
      "options": ["A) ...", "B) ...", "C) ...", "D) ..."],
      "correct": 0,
      "explanation": "clear explanation of why the correct answer is right"
    }},

    // True/False format:
    {{
      "id": 2,
      "type": "truefalse",
      "question": "a precise statement to evaluate",
      "correct": true,
      "explanation": "explanation"
    }},

    // Problem Solving format:
    {{
      "id": 3,
      "type": "problem",
      "question": "detailed, specific problem — include numbers/data if relevant",
      "model_answer": "thorough expected answer covering all key aspects",
      "key_points": ["key concept 1", "key concept 2", "key concept 3"]
    }},

    // Case Study format:
    {{
      "id": 4,
      "type": "casestudy",
      "context": "realistic real-world scenario (2-3 sentences with specific details)",
      "table": {{
        "headers": ["Column1", "Column2", "Column3"],
        "rows": [
          ["val1", "val2", "val3"],
          ["val4", "val5", "val6"],
          ["val7", "val8", "val9"]
        ]
      }},
      "subquestions": [
        {{"id": "4a", "question": "sub-question 1", "model_answer": "expected answer", "points": 4}},
        {{"id": "4b", "question": "sub-question 2", "model_answer": "expected answer", "points": 3}},
        {{"id": "4c", "question": "sub-question 3", "model_answer": "expected answer", "points": 3}}
      ]
    }}

  ]
}}

Rules:
- Follow the plan exactly — same types, same order, same concepts
- Questions must be genuinely educational and accurate
- MCQ options must be plausible (not obviously wrong distractors)
- Problem questions must be specific and non-trivial
- Case study table must have ≥3 rows and meaningful column names
- Sub-question points must sum to 10 per case study
- The "correct" field for MCQ is 0-based index
"""
        raw = await self.llm.generate_async("", [], prompt_override=prompt)
        draft = _parse_json(raw)
        if not draft or "questions" not in draft:
            log.error("[Writer] Failed to parse draft JSON")
            raise ValueError("Writer agent failed to produce valid question JSON")
        return draft

    # ── Agent 3: Reviewer ─────────────────────────────────────────────────────

    async def _run_reviewer(
        self,
        topic: str,
        difficulty: str,
        language: str,
        mix: dict,
        draft: dict,
    ) -> dict:
        """
        Reviews the draft for quality issues:
        - Vague or generic questions → rewrite them
        - Wrong difficulty level → adjust wording
        - Inconsistent JSON structure → fix it
        - Missing fields → add them
        Returns the corrected final exam JSON.
        """
        expected_counts = {k: v for k, v in mix.items() if v > 0}
        draft_json = json.dumps(draft, ensure_ascii=False)

        prompt = f"""You are a senior professor reviewing an AI-generated exam on "{topic}".
Difficulty target: {difficulty}. Language: {language}.
Expected question counts: {expected_counts}.

Review this draft exam and fix ALL of the following issues if present:
1. Generic or vague questions (e.g. "What is machine learning?") → rewrite to be specific and precise
2. Difficulty mismatch → adjust question wording to match {difficulty} level
3. MCQ with obviously wrong distractors → make all options plausible
4. Missing or incomplete fields → add them
5. Duplicate or very similar questions → replace with different concepts
6. Incorrect JSON structure → fix it

Draft exam:
{draft_json}

Return ONLY the corrected exam JSON with the exact same structure.
Do NOT change the number of questions or their types.
Do NOT add any explanation outside the JSON.
"""
        raw = await self.llm.generate_async("", [], prompt_override=prompt)
        reviewed = _parse_json(raw)

        # Fall back to draft if reviewer breaks the structure
        if not reviewed or "questions" not in reviewed:
            log.warning("[Reviewer] Could not parse reviewed JSON, keeping draft")
            return draft

        # Sanity check: reviewer must not drop questions
        if len(reviewed.get("questions", [])) < len(draft.get("questions", [])):
            log.warning("[Reviewer] Reviewer dropped questions, keeping draft")
            return draft

        return reviewed

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
    # SINGLE QUESTION GENERATION  (slot-based UI)
    # ─────────────────────────────────────────────────────────────────────────

    async def generate_single_question(
        self,
        q_type: str,
        topic: str,
        focus: str,
        difficulty: str,
        language: str,
        code: str = "",
        code_language: str = "",
        instruction: str = "",
    ) -> dict:
        """Generate exactly one question of any type for the slot-based exam builder."""
        diff_hint = {
            "Easy":   "basic recall and definitions",
            "Medium": "application and understanding, some calculation",
            "Hard":   "analysis, synthesis, multi-step and critical thinking",
        }.get(difficulty, "medium difficulty")

        focus_line = f"Specific focus: {focus}." if focus.strip() else ""
        instr_line = f"Teacher instruction: {instruction}." if instruction.strip() else ""
        code_block = (
            f"\nCode ({code_language or 'code'}):\n```\n{code}\n```\n"
            if code.strip() else ""
        )

        if q_type == "mcq":
            prompt = (
                f'Generate exactly ONE MCQ for a {difficulty} university exam on "{topic}".\n'
                f"{focus_line} {instr_line}\nDifficulty guide: {diff_hint}. Language: {language}.\n"
                f"{code_block}\nReturn ONLY valid JSON:\n"
                '{{"id":1,"type":"mcq","question":"...","options":["A) ...","B) ...","C) ...","D) ..."],'
                '"correct":0,"explanation":"..."}}'
            )
        elif q_type == "truefalse":
            prompt = (
                f'Generate exactly ONE True/False question for a {difficulty} university exam on "{topic}".\n'
                f"{focus_line} {instr_line}\nDifficulty guide: {diff_hint}. Language: {language}.\n"
                f"{code_block}\nReturn ONLY valid JSON:\n"
                '{{"id":1,"type":"truefalse","question":"...","correct":true,"explanation":"..."}}'
            )
        elif q_type == "problem":
            prompt = (
                f'Generate exactly ONE Problem Solving question for a {difficulty} university exam on "{topic}".\n'
                f"{focus_line} {instr_line}\nDifficulty guide: {diff_hint}. Language: {language}.\n"
                f"{code_block}\nReturn ONLY valid JSON:\n"
                '{{"id":1,"type":"problem","question":"...","model_answer":"...","key_points":["...","...","..."]}}'
            )
        elif q_type == "casestudy":
            prompt = (
                f'Generate exactly ONE Case Study question for a {difficulty} university exam on "{topic}".\n'
                f"{focus_line} {instr_line}\nDifficulty guide: {diff_hint}. Language: {language}.\n"
                f"{code_block}\nReturn ONLY valid JSON:\n"
                '{{"id":1,"type":"casestudy","context":"realistic scenario (2-3 sentences)",'
                '"table":{{"headers":["Col1","Col2","Col3"],"rows":[["v1","v2","v3"],["v4","v5","v6"],["v7","v8","v9"]]}},'
                '"subquestions":[{{"id":"a","question":"...","model_answer":"...","points":4}},'
                '{{"id":"b","question":"...","model_answer":"...","points":3}},'
                '{{"id":"c","question":"...","model_answer":"...","points":3}}]}}'
            )
        elif q_type == "code":
            prompt = (
                f'Generate a Code Analysis exam question for a {difficulty} university exam on "{topic}".\n'
                f"{focus_line} {instr_line}\nDifficulty guide: {diff_hint}. Language: {language}.\n"
                f"Code ({code_language}):\n```\n{code}\n```\n\n"
                "Generate 2-3 educational sub-questions (comprehension, analysis, improvement).\n"
                "Return ONLY valid JSON:\n"
                '{{"id":1,"type":"code","code":"<the code>","code_language":"...","context":"what this code does",'
                '"subquestions":[{{"id":"a","question":"...","model_answer":"...","points":4}},'
                '{{"id":"b","question":"...","model_answer":"...","points":3}},'
                '{{"id":"c","question":"...","model_answer":"...","points":3}}]}}'
            )
        else:
            raise ValueError(f"Unknown question type: {q_type}")

        raw = await self.llm.generate_async("", [], prompt_override=prompt)
        result = _parse_json(raw)
        if not result:
            raise ValueError(f"Failed to parse {q_type} question from LLM response")
        result["type"] = q_type
        return result

    async def get_slot_focus_suggestions(self, topic: str, q_type: str) -> list[str]:
        """Return 6 type-specific focus ideas for a question slot."""
        guidance = {
            "mcq":       "specific concepts, definitions, or short factual topics suitable for MCQ",
            "truefalse": "precise statements that can be clearly evaluated as true or false",
            "problem":   "specific calculation, derivation, or application problem types",
            "casestudy": "realistic scenarios or industry contexts to build a case study around",
            "code":      "code analysis, debugging, or optimization tasks",
        }.get(q_type, "specific subtopics")

        prompt = (
            f'A professor is building a {q_type.upper()} question about "{topic}".\n'
            f"Suggest exactly 6 specific, concise focus ideas for {guidance}.\n"
            "Each suggestion should be 2–6 words. Be precise and educational — not generic.\n"
            "Return ONLY a JSON array of 6 strings.\n"
            f'Example for MCQ on SQL: ["SELECT with JOIN", "NULL handling", '
            f'"GROUP BY aggregate", "Subquery vs JOIN", "Index optimization", "ACID properties"]'
        )
        raw = await self.llm.generate_async("", [], prompt_override=prompt)
        return self._parse_string_list(raw, limit=6)

    async def get_code_suggestions(
        self,
        code: str,
        code_language: str,
        topic: str,
    ) -> list[str]:
        """Return 5 AI-suggested question angles for a given code snippet."""
        prompt = (
            f"A professor wants to create exam questions about this {code_language} code:\n"
            f"```\n{code[:1200]}\n```\n"
            f"Topic context: {topic or 'programming'}.\n\n"
            "Suggest exactly 5 specific, concise questions (under 15 words each) "
            "a professor could ask students about this code.\n"
            "Return ONLY a JSON array of 5 strings.\n"
            'Example: ["What is the time complexity?", "Find the bug in the loop", ...]'
        )
        raw = await self.llm.generate_async("", [], prompt_override=prompt)
        return self._parse_string_list(raw, limit=5)

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
