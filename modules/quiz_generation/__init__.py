"""
modules/quiz_generation — Smart Quiz Generation Pipeline
=========================================================

3-step workflow
───────────────
  Step 1  extract_concepts(topic)
          → {"topic": str, "concepts": [str, ...]}

  Step 2  Teacher / caller selects a subset of concepts

  Step 3  generate_quiz(topic, selected_concepts, total_questions, image_count)
          → [question_dict, ...]

Supporting layers
─────────────────
  QuizValidator     — structural validation + auto-fix after LLM generation
  QuizScorer        — smart grading (exact match for MCQ/T/F, LLM-semantic for SA)
  QuizExporter      — export to JSON or printable HTML (student sheet / answer key)
  QuizImageGenerator— LLM-generated matplotlib/networkx diagrams with retry

Quick start
───────────
    from modules.quiz_generation import (
        QuizGenerator,
        QuizImageGenerator,
        QuizValidator,
        QuizScorer,
        QuizExporter,
    )

    gen      = QuizGenerator()
    concepts = await gen.extract_concepts("Machine Learning")
    # → {"topic": "Machine Learning", "concepts": [...15 items...]}

    questions = await gen.generate_quiz(
        topic="Machine Learning",
        selected_concepts=["Overfitting", "Gradient Descent", "Backpropagation"],
        total_questions=10,
        image_questions_count=3,
    )

    # Generate diagram images
    img_gen = QuizImageGenerator(llm_engine=gen.llm)
    for q in questions:
        if q["type"] == "image":
            q["image_path"] = await img_gen.generate_image(q["image_prompt"], q["concept"])

    # Export
    exporter  = QuizExporter()
    html_path = exporter.to_html(questions, topic="Machine Learning")
    json_path = exporter.to_json(questions, topic="Machine Learning")

    # Score (after student submits answers)
    scorer = QuizScorer(llm_engine=gen.llm)
    report = await scorer.score_quiz(questions, student_answers=["A", "True", ...])
    print(report["grade"], report["percentage"])
"""

from modules.quiz_generation.quiz_generator  import QuizGenerator
from modules.quiz_generation.image_generator import QuizImageGenerator
from modules.quiz_generation.quiz_validator  import QuizValidator
from modules.quiz_generation.quiz_scorer     import QuizScorer
from modules.quiz_generation.quiz_exporter   import QuizExporter

__all__ = [
    "QuizGenerator",
    "QuizImageGenerator",
    "QuizValidator",
    "QuizScorer",
    "QuizExporter",
]
