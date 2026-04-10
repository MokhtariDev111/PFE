"""
modules/quiz_generation — Quiz Generation from Documents
=========================================================
Planned feature: Automatically generate multiple-choice and open-ended
quizzes from uploaded documents or a given topic.

Planned API:
    from modules.quiz_generation import generate_quiz

    quiz = await generate_quiz(
        chunks=retrieved_chunks,   # or prompt="neural networks"
        num_questions=10,
        difficulty="medium",       # easy | medium | hard
        language="English",
        question_types=["mcq", "open"],
    )
"""

# TODO: Implement quiz generation pipeline
# - MCQ: question + 4 options + correct answer + explanation
# - Open: question + model answer
# - Reuse: retrieval pipeline for RAG-based quiz generation
