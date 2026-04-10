"""
modules/prompt_generation — Generate Presentations from Prompt
===============================================================
Planned feature: Generate full presentations directly from a text
prompt (no document upload required), using LLM knowledge alone.

Planned API:
    from modules.prompt_generation import generate_from_prompt

    slides = await generate_from_prompt(
        prompt="Explain neural networks",
        num_slides=8,
        language="English",
        theme="Dark Navy",
    )
"""

# TODO: Implement prompt-only generation pipeline
# - No RAG retrieval needed (no documents)
# - LLM generates content directly from prompt
# - Reuse: doc_generation/llm.py, doc_generation/html_renderer.py
