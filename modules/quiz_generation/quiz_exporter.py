"""
quiz_exporter.py — Export quizzes to JSON and printable HTML
=============================================================
Formats supported:
  • JSON  — structured data for API / frontend consumption
  • HTML  — clean, printable quiz sheet with two variants:
              student version (no answers, fill-in blanks)
              answer key     (answers highlighted + answer table at the end)

Usage:
    from modules.quiz_generation.quiz_exporter import QuizExporter

    exporter  = QuizExporter()
    json_path = exporter.to_json(questions, topic="Machine Learning")
    html_path = exporter.to_html(questions, topic="Machine Learning", include_answers=False)
    key_path  = exporter.to_html(questions, topic="Machine Learning", include_answers=True)
"""

import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Optional

log = logging.getLogger("quiz.exporter")

# Default output directory  (project_root/outputs/quiz_exports)
EXPORTS_DIR = Path(__file__).resolve().parent.parent.parent / "outputs" / "quiz_exports"
EXPORTS_DIR.mkdir(parents=True, exist_ok=True)

# Difficulty → CSS class
_DIFF_CLASS = {
    "easy":   "diff-easy",
    "medium": "diff-medium",
    "hard":   "diff-hard",
}
_DIFF_LABEL = {
    "easy":   "Easy",
    "medium": "Medium",
    "hard":   "Hard",
}
_FMT_LABEL = {
    "mcq":          "MCQ",
    "true_false":   "True / False",
    "short_answer": "Short Answer",
}
_LETTERS = list("ABCDEFGH")


# ─────────────────────────────────────────────────────────────────────────────
# QUIZ EXPORTER
# ─────────────────────────────────────────────────────────────────────────────

class QuizExporter:
    """
    Export a list of quiz question dicts to JSON or printable HTML.
    All files are saved to outputs/quiz_exports/ by default.
    """

    # ── JSON ──────────────────────────────────────────────────────────────────

    def to_json(
        self,
        questions: list,
        topic: str = "quiz",
        path: Optional[str] = None,
    ) -> str:
        """
        Serialize quiz to a JSON file.

        Returns:
            Absolute path to the saved file.
        """
        file_path = self._resolve_path(path or self._filename(topic, "json"))

        payload = {
            "topic":     topic,
            "generated": datetime.now().isoformat(timespec="seconds"),
            "total":     len(questions),
            "questions": questions,
        }

        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2, ensure_ascii=False)

        log.info(f"Quiz exported → JSON: {file_path}")
        return str(file_path)

    # ── HTML ──────────────────────────────────────────────────────────────────

    def to_html(
        self,
        questions: list,
        topic: str = "Quiz",
        path: Optional[str] = None,
        include_answers: bool = False,
        show_images: bool = True,
    ) -> str:
        """
        Export quiz to a clean, print-ready HTML file.

        Args:
            questions       : list of question dicts from generate_quiz
            topic           : quiz topic shown in the title
            path            : output file path (auto-generated if None)
            include_answers : True  → answer key mode (answers highlighted + table)
                              False → student sheet (answer blanks)
            show_images     : whether to embed diagram images (<img> or placeholder)

        Returns:
            Absolute path to the saved file.
        """
        suffix    = "_answer_key" if include_answers else "_student"
        file_path = self._resolve_path(path or self._filename(topic + suffix, "html"))

        html = self._build_html(questions, topic, include_answers, show_images)

        with open(file_path, "w", encoding="utf-8") as f:
            f.write(html)

        log.info(f"Quiz exported → HTML: {file_path}")
        return str(file_path)

    # ─────────────────────────────────────────────────────────────────────────
    # HTML BUILDER
    # ─────────────────────────────────────────────────────────────────────────

    def _build_html(
        self,
        questions: list,
        topic: str,
        include_answers: bool,
        show_images: bool,
    ) -> str:
        date_str   = datetime.now().strftime("%B %d, %Y")
        q_blocks   = "\n".join(
            self._question_block(q, i + 1, include_answers, show_images)
            for i, q in enumerate(questions)
        )
        stats_bar  = self._stats_bar(questions)
        answer_key = self._answer_key_section(questions) if include_answers else ""

        mode_badge = (
            '<span class="mode-badge key">Answer Key</span>'
            if include_answers else
            '<span class="mode-badge student">Student Copy</span>'
        )

        return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Quiz — {topic}</title>
  <style>{_CSS}</style>
</head>
<body>
<div class="page">

  <!-- ── HEADER ── -->
  <header class="quiz-header">
    <div class="header-main">
      <div class="header-title">
        <h1>📚 {topic}</h1>
        <p class="subtitle">{date_str} &nbsp;·&nbsp; {len(questions)} Questions</p>
      </div>
      <div class="header-info">
        {mode_badge}
        <div class="info-row">
          <span class="info-label">Name</span>
          <div class="info-line"></div>
        </div>
        <div class="info-row">
          <span class="info-label">Score</span>
          <div class="info-line short"></div>
        </div>
      </div>
    </div>
    {stats_bar}
  </header>

  <!-- ── QUESTIONS ── -->
  <main class="question-list">
    {q_blocks}
  </main>

  <!-- ── ANSWER KEY ── -->
  {answer_key}

</div>
</body>
</html>"""

    # ── Question block ────────────────────────────────────────────────────────

    def _question_block(
        self, q: dict, num: int, include_answers: bool, show_images: bool
    ) -> str:
        diff_cls = _DIFF_CLASS.get(q.get("difficulty", "medium"), "diff-medium")
        diff_lbl = _DIFF_LABEL.get(q.get("difficulty", "medium"), "Medium")
        fmt_lbl  = _FMT_LABEL.get(q.get("format", ""), q.get("format", "").upper())
        concept  = q.get("concept", "")
        q_type   = q.get("type", "text")

        # ── Image block ────────────────────────────────────────────────────
        img_html = ""
        if q_type == "image" and show_images:
            img_path = q.get("image_path", "")
            if img_path and Path(img_path).exists():
                img_html = (
                    f'<div class="img-wrap">'
                    f'<img src="{img_path}" alt="Diagram for {concept}" /></div>'
                )
            else:
                prompt_preview = (q.get("image_prompt", "Diagram") or "Diagram")[:90]
                img_html = (
                    f'<div class="img-placeholder">'
                    f'📊 {prompt_preview}{"…" if len(q.get("image_prompt","")) > 90 else ""}'
                    f'</div>'
                )

        # ── Options ────────────────────────────────────────────────────────
        opts = q.get("options", [])
        if opts:
            items = "".join(
                f'<li class="opt-item">'
                f'<span class="opt-letter">{_LETTERS[j]}</span> {opt}</li>'
                for j, opt in enumerate(opts)
            )
            input_area = f'<ul class="options-list">{items}</ul>'
        else:
            # Short answer blank line
            input_area = (
                '<div class="answer-blank">'
                '<span class="blank-lbl">Answer:</span>'
                '<div class="blank-line"></div>'
                '</div>'
            )

        # ── Answer reveal (answer-key mode) ────────────────────────────────
        answer_reveal = ""
        if include_answers and q.get("answer"):
            answer_reveal = (
                f'<div class="answer-reveal">'
                f'<span class="ans-tick">✓</span> '
                f'<strong>{q["answer"]}</strong>'
                f'</div>'
            )

        return f"""    <div class="q-card">
      <div class="q-header">
        <div class="q-num">{num}</div>
        <div class="q-tags">
          <span class="tag {diff_cls}">{diff_lbl}</span>
          <span class="tag tag-fmt">{fmt_lbl}</span>
          <span class="tag tag-concept">{concept}</span>
        </div>
      </div>
      <p class="q-text">{q.get("question", "")}</p>
      {img_html}
      {input_area}
      {answer_reveal}
    </div>"""

    # ── Stats bar ─────────────────────────────────────────────────────────────

    def _stats_bar(self, questions: list) -> str:
        total  = len(questions)
        easy   = sum(1 for q in questions if q.get("difficulty") == "easy")
        medium = sum(1 for q in questions if q.get("difficulty") == "medium")
        hard   = sum(1 for q in questions if q.get("difficulty") == "hard")
        mcq    = sum(1 for q in questions if q.get("format")    == "mcq")
        tf     = sum(1 for q in questions if q.get("format")    == "true_false")
        sa     = sum(1 for q in questions if q.get("format")    == "short_answer")
        imgs   = sum(1 for q in questions if q.get("type")      == "image")

        img_chip = f'<span class="stat-chip">🖼 {imgs} Image</span>' if imgs else ""

        return f"""    <div class="stats-bar">
      <span class="stat-chip">📝 {total} Questions</span>
      <span class="stat-chip chip-easy">🟢 {easy} Easy</span>
      <span class="stat-chip chip-med">🟡 {medium} Medium</span>
      <span class="stat-chip chip-hard">🔴 {hard} Hard</span>
      <span class="stat-chip">MCQ: {mcq}</span>
      <span class="stat-chip">T/F: {tf}</span>
      <span class="stat-chip">SA: {sa}</span>
      {img_chip}
    </div>"""

    # ── Answer key section ────────────────────────────────────────────────────

    def _answer_key_section(self, questions: list) -> str:
        rows = "".join(
            f"""        <tr>
          <td class="ak-num">Q{i + 1}</td>
          <td class="ak-concept">{q.get("concept", "")}</td>
          <td class="ak-diff {_DIFF_CLASS.get(q.get('difficulty','medium'), 'diff-medium')}">{_DIFF_LABEL.get(q.get('difficulty','medium'), '')}</td>
          <td class="ak-ans">{q.get("answer", "")}</td>
        </tr>"""
            for i, q in enumerate(questions)
        )
        return f"""  <section class="answer-key">
    <h2>Answer Key</h2>
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Concept</th>
          <th>Difficulty</th>
          <th>Answer</th>
        </tr>
      </thead>
      <tbody>
        {rows}
      </tbody>
    </table>
  </section>"""

    # ─────────────────────────────────────────────────────────────────────────
    # UTILITIES
    # ─────────────────────────────────────────────────────────────────────────

    @staticmethod
    def _filename(label: str, ext: str) -> str:
        safe = "".join(c if c.isalnum() or c in " _-" else "_" for c in label)
        safe = safe.strip().replace(" ", "_").lower()[:48]
        ts   = datetime.now().strftime("%Y%m%d_%H%M%S")
        return f"{safe}_{ts}.{ext}"

    @staticmethod
    def _resolve_path(filename: str) -> Path:
        p = Path(filename)
        return p if p.is_absolute() else EXPORTS_DIR / p


# ─────────────────────────────────────────────────────────────────────────────
# EMBEDDED CSS
# ─────────────────────────────────────────────────────────────────────────────

_CSS = """
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: 'Segoe UI', system-ui, Arial, sans-serif;
    background: #eef0f4;
    color: #1a1a2e;
    font-size: 14px;
    line-height: 1.55;
  }

  /* ── Page wrapper ───────────────────────────────────── */
  .page {
    max-width: 880px;
    margin: 28px auto 48px;
    background: #fff;
    border-radius: 14px;
    box-shadow: 0 6px 32px rgba(0,0,0,.12);
    overflow: hidden;
  }

  /* ── Header ─────────────────────────────────────────── */
  .quiz-header {
    background: linear-gradient(135deg, #0f3460 0%, #16213e 55%, #1a1a2e 100%);
    color: #fff;
    padding: 30px 36px 18px;
  }
  .header-main {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 24px;
    flex-wrap: wrap;
  }
  h1 { font-size: 24px; font-weight: 700; letter-spacing: .3px; }
  .subtitle { font-size: 12px; opacity: .68; margin-top: 4px; }

  .header-info { display: flex; flex-direction: column; gap: 10px; min-width: 200px; }
  .mode-badge {
    display: inline-block;
    font-size: 11px; font-weight: 700;
    padding: 3px 10px; border-radius: 20px;
    letter-spacing: .6px; text-transform: uppercase;
    align-self: flex-end;
  }
  .mode-badge.student { background: rgba(255,255,255,.18); }
  .mode-badge.key     { background: #e8f5e9; color: #1b5e20; }

  .info-row { display: flex; align-items: center; gap: 8px; }
  .info-label { font-size: 11px; opacity: .65; white-space: nowrap; min-width: 44px; }
  .info-line {
    flex: 1; height: 1px;
    background: rgba(255,255,255,.4);
    margin-top: 1px;
  }
  .info-line.short { max-width: 72px; }

  /* ── Stats bar ───────────────────────────────────────── */
  .stats-bar {
    display: flex; flex-wrap: wrap; gap: 7px;
    margin-top: 16px;
    padding-top: 14px;
    border-top: 1px solid rgba(255,255,255,.15);
  }
  .stat-chip {
    font-size: 11px; font-weight: 600;
    background: rgba(255,255,255,.13);
    padding: 3px 10px; border-radius: 20px;
    color: #fff;
  }
  .chip-easy { background: rgba(76,175,80,.25); }
  .chip-med  { background: rgba(255,193,7,.25); }
  .chip-hard { background: rgba(244,67,54,.25); }

  /* ── Question list ──────────────────────────────────── */
  .question-list {
    padding: 24px 32px;
    display: flex; flex-direction: column; gap: 18px;
  }

  .q-card {
    border: 1px solid #e4e7ef;
    border-radius: 10px;
    padding: 18px 20px 16px;
    background: #fafbfd;
    page-break-inside: avoid;
  }

  .q-header {
    display: flex; align-items: center; gap: 12px;
    margin-bottom: 11px;
  }
  .q-num {
    width: 32px; height: 32px; border-radius: 50%;
    background: #1a1a2e; color: #fff;
    font-size: 13px; font-weight: 700;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
  }
  .q-tags { display: flex; flex-wrap: wrap; gap: 5px; }
  .tag {
    font-size: 10px; font-weight: 700;
    padding: 2px 7px; border-radius: 4px;
    text-transform: uppercase; letter-spacing: .4px;
  }
  .diff-easy   { background: #e8f5e9; color: #2e7d32; }
  .diff-medium { background: #fff8e1; color: #e65100; }
  .diff-hard   { background: #ffebee; color: #c62828; }
  .tag-fmt     { background: #e3f2fd; color: #1565c0; }
  .tag-concept { background: #f3e5f5; color: #6a1b9a; }

  .q-text {
    font-size: 15px; color: #1a1a2e;
    margin-bottom: 13px; line-height: 1.6;
  }

  /* ── Image ──────────────────────────────────────────── */
  .img-wrap { text-align: center; margin: 10px 0 14px; }
  .img-wrap img {
    max-width: 100%; border-radius: 8px;
    border: 1px solid #dde; box-shadow: 0 2px 8px rgba(0,0,0,.08);
  }
  .img-placeholder {
    background: #f8f9fa; border: 2px dashed #c8cdd8;
    border-radius: 8px; padding: 18px;
    color: #7a8390; font-size: 12px; text-align: center;
    margin: 8px 0 12px;
  }

  /* ── Options ────────────────────────────────────────── */
  .options-list {
    list-style: none; display: flex; flex-direction: column; gap: 7px;
  }
  .opt-item { display: flex; align-items: center; gap: 9px; font-size: 14px; }
  .opt-letter {
    width: 24px; height: 24px; border-radius: 50%;
    background: #e9ecef; color: #495057;
    font-weight: 700; font-size: 11px;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
  }

  /* ── Short answer blank ─────────────────────────────── */
  .answer-blank { display: flex; align-items: center; gap: 10px; margin-top: 6px; }
  .blank-lbl { font-size: 12px; color: #888; font-weight: 600; white-space: nowrap; }
  .blank-line { flex: 1; height: 1px; background: #bbb; }

  /* ── Answer reveal ──────────────────────────────────── */
  .answer-reveal {
    margin-top: 11px; padding: 7px 12px;
    background: #e8f5e9; border-left: 4px solid #43a047;
    border-radius: 4px; font-size: 13px; color: #1b5e20;
  }
  .ans-tick { font-weight: 700; margin-right: 5px; }

  /* ── Answer key section ─────────────────────────────── */
  .answer-key {
    margin: 0 32px 36px;
    border: 1px solid #e0e4ee;
    border-radius: 10px;
    overflow: hidden;
  }
  .answer-key h2 {
    background: #1a1a2e; color: #fff;
    padding: 11px 20px; font-size: 15px; font-weight: 600;
  }
  .answer-key table { width: 100%; border-collapse: collapse; }
  .answer-key th {
    background: #f4f6fb; padding: 9px 14px;
    font-size: 11px; text-transform: uppercase;
    letter-spacing: .5px; text-align: left;
    border-bottom: 1px solid #e0e4ee; color: #555;
  }
  .answer-key td { padding: 8px 14px; font-size: 13px; border-bottom: 1px solid #f0f2f8; }
  .ak-num     { font-weight: 700; color: #1a1a2e; width: 40px; }
  .ak-concept { color: #6a1b9a; }
  .ak-diff    { width: 90px; }
  .ak-ans     { font-weight: 600; color: #1b5e20; }

  /* ── Print ──────────────────────────────────────────── */
  @media print {
    body  { background: #fff; }
    .page { box-shadow: none; margin: 0; border-radius: 0; max-width: 100%; }
    .q-card { page-break-inside: avoid; border-color: #ccc; }
    .quiz-header {
      background: #1a1a2e !important;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
  }
"""
