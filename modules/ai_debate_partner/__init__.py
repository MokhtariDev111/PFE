"""
modules/ai_debate_partner — AI Debate Learning Partner
=======================================================
A Socratic tutor and adaptive AI coach that helps users learn
through reasoning, reflection, and guided discovery.

Modules:
  debate_engine.py   — core chat logic, mode routing, prompt building
  memory_store.py    — MongoDB persistent memory (goals, weak topics, history)
  rag_retriever.py   — isolated RAG pipeline (independent FAISS index)
  web_search.py      — real-time web search via Tavily

Quick start:
    from modules.ai_debate_partner import DebateEngine
    engine = DebateEngine()
    response = await engine.chat(
        message="What is overfitting?",
        mode="debate",
        conversation_id="abc123",
    )
"""

from modules.ai_debate_partner.debate_engine import DebateEngine

__all__ = ["DebateEngine"]
