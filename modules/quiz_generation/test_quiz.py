"""
test_quiz.py — Full interactive quiz pipeline demo
===================================================
Run from project root:
    python modules/quiz_generation/test_quiz.py

Demonstrates all 5 layers:
  1. QuizGenerator  — concept extraction + quiz generation (with retry)
  2. QuizValidator  — automatic validation report
  3. QuizImageGenerator — diagram image generation (with retry + error feedback)
  4. QuizExporter   — export to JSON + HTML (student sheet & answer key)
  5. QuizScorer     — grade a sample submission (semantic scoring for short answers)
"""

import asyncio
import json
import sys
from pathlib import Path

from dotenv import load_dotenv
load_dotenv()

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from modules.quiz_generation import (
    QuizGenerator,
    QuizImageGenerator,
    QuizValidator,
    QuizScorer,
    QuizExporter,
)


# ─────────────────────────────────────────────────────────────────────────────
# UI HELPERS
# ─────────────────────────────────────────────────────────────────────────────

W = 66

def _banner(title: str):
    print("\n" + "╔" + "═" * (W - 2) + "╗")
    print("║" + f"  {title}".ljust(W - 2) + "║")
    print("╚" + "═" * (W - 2) + "╝")

def _section(label: str):
    print(f"\n  {'─' * 4}  {label}  {'─' * max(0, W - 12 - len(label))}")

def _ask_int(prompt: str, min_val: int = 0) -> int:
    while True:
        try:
            val = int(input(prompt).strip())
            if val >= min_val:
                return val
            print(f"    ⚠  Enter a number ≥ {min_val}")
        except ValueError:
            print("    ⚠  Please enter a valid integer.")

def _ask_concepts(concepts: list) -> list:
    print("\n  Available concepts:")
    for i, c in enumerate(concepts, 1):
        print(f"    {i:>2}.  {c}")
    print("\n  Enter numbers separated by commas  (e.g. 1,3,5)")
    print("  Press Enter to select ALL")

    while True:
        raw = input("  Your selection: ").strip()
        if not raw:
            return concepts
        try:
            indices  = [int(x.strip()) for x in raw.split(",")]
            selected = [concepts[i - 1] for i in indices if 1 <= i <= len(concepts)]
            if selected:
                return selected
            print("    ⚠  No valid selections — try again.")
        except (ValueError, IndexError):
            print("    ⚠  Use comma-separated numbers like: 1,3,5")


def _display_quiz(topic: str, questions: list):
    """Pretty-print the quiz to the terminal."""
    _banner(f"QUIZ — {topic}  ({len(questions)} questions)")

    diff_icons  = {"easy": "🟢", "medium": "🟡", "hard": "🔴"}
    fmt_labels  = {
        "mcq":          "MCQ",
        "true_false":   "T/F",
        "short_answer": "SA ",
    }

    for i, q in enumerate(questions, 1):
        icon  = diff_icons.get(q.get("difficulty", ""), "⚪")
        fmt   = fmt_labels.get(q.get("format", ""), "   ")
        qtype = "[IMG]" if q.get("type") == "image" else "[TXT]"

        print(f"\n  ┌─ Q{i}  {qtype}  {fmt}  {icon}  —  {q.get('concept', '')}")
        print( "  │")

        # Wrap question text at 58 chars
        words = q["question"].split()
        line  = "  │   "
        for word in words:
            if len(line) + len(word) + 1 > 63:
                print(line)
                line = "  │   " + word
            else:
                line += (" " if line != "  │   " else "") + word
        print(line)

        if q.get("options"):
            print("  │")
            for opt in q["options"]:
                print(f"  │     • {opt}")

        print("  │")
        print(f"  │   ✓  {q['answer']}")

        if q.get("image_path"):
            print(f"  │   🖼  {Path(q['image_path']).name}")
        elif q.get("type") == "image" and q.get("image_prompt"):
            print(f"  │   📝  {q['image_prompt'][:60]}…")

        print(f"  └{'─' * 58}")


def _display_validation(report: dict):
    """Show validator statistics."""
    stats = report.get("stats", {})
    issues = report.get("issues", [])

    print(f"\n  Validation:  {report['fixed_count']}/{report['original_count']} valid"
          f"  ({report['dropped_count']} dropped)")

    if stats:
        dd = stats.get("difficulty_pct", {})
        print(f"  Difficulty:  Easy {dd.get('easy', 0)}%  "
              f"Medium {dd.get('medium', 0)}%  "
              f"Hard {dd.get('hard', 0)}%")
        td = stats.get("type_dist", {})
        fd = stats.get("format_dist", {})
        print(f"  Types:       Text {td.get('text', 0)}  Image {td.get('image', 0)}")
        print(f"  Formats:     MCQ {fd.get('mcq', 0)}  "
              f"T/F {fd.get('true_false', 0)}  "
              f"SA {fd.get('short_answer', 0)}")

    if issues:
        print(f"  Issues ({len(issues)}):")
        for issue in issues[:6]:
            print(f"    • {issue}")
        if len(issues) > 6:
            print(f"    … and {len(issues) - 6} more")


def _display_score_report(report: dict):
    """Print a scoring report."""
    _banner(f"SCORE REPORT — {report['grade']}  ({report['percentage']}%)")
    print(f"\n  {report['summary']}")

    _section("Per-concept breakdown")
    for concept, data in report["per_concept"].items():
        bar = "█" * int(data["percentage"] / 10) + "░" * (10 - int(data["percentage"] / 10))
        print(f"    {concept[:30]:<30} {bar}  {data['percentage']}%  "
              f"({data['correct']}/{data['total']})")

    _section("Per-difficulty breakdown")
    for diff, data in report["per_difficulty"].items():
        icon = {"easy": "🟢", "medium": "🟡", "hard": "🔴"}.get(diff, "⚪")
        print(f"    {icon} {diff:<8}  {data['correct']}/{data['total']}"
              f"  ({data['percentage']}%)")

    if report.get("weak_concepts"):
        _section("Weak areas (< 60%)")
        for c in report["weak_concepts"]:
            print(f"    ⚠  {c}")


# ─────────────────────────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────────────────────────

async def main():
    gen     = QuizGenerator()
    img_gen = QuizImageGenerator(llm_engine=gen.llm)
    scorer  = QuizScorer(llm_engine=gen.llm)
    exporter= QuizExporter()

    _banner("QUIZ GENERATOR  —  Interactive Mode")

    # ── 1. Question counts ─────────────────────────────────────────────────
    _section("Step 1 — Question counts")
    text_count  = _ask_int("  TEXT  questions: ", min_val=0)
    image_count = _ask_int("  IMAGE questions: ", min_val=0)
    total       = text_count + image_count

    if total == 0:
        print("\n  Total must be > 0. Exiting.")
        return

    print(f"\n  → {total} questions  ({text_count} text + {image_count} image)")

    # ── 2. Topic ───────────────────────────────────────────────────────────
    _section("Step 2 — Topic")
    topic = input("  Enter topic (e.g. Machine Learning, SQL, Neural Networks): ").strip()
    if not topic:
        print("  No topic entered. Exiting.")
        return

    # ── 3. Concept extraction ──────────────────────────────────────────────
    _section(f"Step 3 — Extracting concepts for: {topic}")
    result   = await gen.extract_concepts(topic)
    concepts = result["concepts"]

    if not concepts:
        print("  ✗ Failed to extract concepts. Check your API keys.")
        return

    print(f"  → {len(concepts)} concepts found")
    selected = _ask_concepts(concepts)
    print(f"\n  Selected {len(selected)} concept(s):")
    for c in selected:
        print(f"    • {c}")

    # ── 4. Quiz generation ─────────────────────────────────────────────────
    _section(f"Step 4 — Generating {total} questions…")
    questions = await gen.generate_quiz(
        topic=topic,
        selected_concepts=selected,
        total_questions=total,
        image_questions_count=image_count,
    )

    if not questions:
        print("  ✗ Quiz generation failed. Check your API keys or try again.")
        return

    # ── 5. Validation stats ────────────────────────────────────────────────
    validator = gen.validator
    val_report = validator.validate_and_fix(questions, selected)
    _display_validation(val_report)

    # ── 6. Display quiz ────────────────────────────────────────────────────
    _display_quiz(topic, questions)

    # ── 7. Image generation ────────────────────────────────────────────────
    image_qs = [q for q in questions if q.get("type") == "image"]

    if image_qs:
        _section(f"Step 5 — Generating {len(image_qs)} diagram image(s)…")
        for i, q in enumerate(image_qs, 1):
            print(f"\n  [{i}/{len(image_qs)}] Concept : {q['concept']}")
            print(f"           Prompt  : {q.get('image_prompt', '')[:80]}…")

            path = await img_gen.generate_image(
                image_prompt=q["image_prompt"],
                concept=q["concept"],
                output_filename=f"{topic.replace(' ', '_').lower()}_{i}.png",
            )
            if path:
                print(f"           ✓ Saved : {path}")
                q["image_path"] = path
            else:
                print(f"           ✗ Image generation failed for this question")

    # ── 8. Export ──────────────────────────────────────────────────────────
    _section("Step 6 — Exporting")

    json_path    = exporter.to_json(questions, topic=topic)
    student_path = exporter.to_html(questions, topic=topic, include_answers=False)
    key_path     = exporter.to_html(questions, topic=topic, include_answers=True)

    print(f"  JSON        : {json_path}")
    print(f"  Student HTML: {student_path}")
    print(f"  Answer Key  : {key_path}")

    # ── 9. Demo scoring ────────────────────────────────────────────────────
    _section("Step 7 — Demo scoring (random answers)")

    # Build a mock "student" submission:
    #   correct answer for the first half, blank for the rest
    midpoint = max(1, len(questions) // 2)
    mock_answers = []
    for i, q in enumerate(questions):
        if i < midpoint:
            mock_answers.append(q["answer"])   # deliberately correct
        else:
            mock_answers.append("")             # deliberately blank

    score_report = await scorer.score_quiz(questions, mock_answers)
    _display_score_report(score_report)

    # ── 10. Save raw output ────────────────────────────────────────────────
    raw_out = Path(__file__).parent / "test_output.json"
    with open(raw_out, "w", encoding="utf-8") as f:
        json.dump(questions, f, indent=2, ensure_ascii=False)

    _banner("Done!")
    print(f"  Quiz data saved to : {raw_out}")
    print(f"  HTML (student)     : {student_path}")
    print(f"  HTML (answer key)  : {key_path}")
    print()


if __name__ == "__main__":
    asyncio.run(main())
