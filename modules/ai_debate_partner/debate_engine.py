"""
debate_engine.py — Core chat logic and mode routing
=====================================================
Handles:
  - Mode routing (debate / explain / coach / auto)
  - Conversation history management
  - Streaming responses via the existing LLMEngine
  - Context injection (memory, RAG, web) — pluggable, added incrementally
"""

import logging
from typing import AsyncGenerator

from modules.doc_generation.llm import LLMEngine
from modules.ai_debate_partner.prompts import build_system_prompt
from modules.ai_debate_partner.memory_store import MemoryStore

log = logging.getLogger("debate.engine")

VALID_MODES = {"debate", "explain", "coach", "auto"}


class DebateEngine:
    """
    Core engine for the AI Debate Learning Partner.

    Usage:
        engine = DebateEngine()

        # Non-streaming
        reply = await engine.chat(
            message="What is overfitting?",
            mode="debate",
            history=[{"role": "user", "content": "..."}, ...],
        )

        # Streaming
        async for chunk in engine.chat_stream(...):
            print(chunk, end="", flush=True)
    """

    def __init__(self, llm_engine: LLMEngine = None):
        self.llm    = llm_engine or LLMEngine()
        self.memory = MemoryStore()

    async def chat(
        self,
        message: str,
        mode: str = "auto",
        source: str = "auto",       # "auto" | "rag" | "web" | "none"
        history: list[dict] = None,
        conversation_id: str = "",
        memory_context: str = "",
        rag_context: str = "",
        web_context: str = "",
    ) -> str:
        """
        Generate a single response.
        If conversation_id is provided, loads history from MongoDB and saves the exchange.
        """
        mode = mode if mode in VALID_MODES else "auto"

        # Load history from DB if conversation_id given and no history passed
        if conversation_id and not history:
            history = self.memory.get_history(conversation_id)

        history = history or []

        # Build memory context from profile if not provided
        if not memory_context:
            memory_context = self.memory.build_memory_context()

        # Auto-retrieve RAG context if a document index exists for this conversation
        if not rag_context and conversation_id:
            try:
                from modules.ai_debate_partner.rag_retriever import retrieve, index_exists
                if index_exists(conversation_id):
                    rag_context = retrieve(conversation_id, message, top_k=4)
            except Exception as e:
                log.warning(f"RAG retrieval skipped: {e}")

        # Web search fallback — if no RAG context and source allows web
        if not rag_context and not web_context and source in ("web", "auto"):
            try:
                from modules.ai_debate_partner.web_search import search
                web_context = await search(message, max_results=3)
            except Exception as e:
                log.warning(f"Web search skipped: {e}")

        system_prompt = build_system_prompt(
            mode=mode,
            memory_context=memory_context,
            rag_context=rag_context,
            web_context=web_context,
        )

        full_prompt = self._build_prompt(system_prompt, history, message)

        log.info(f"[DebateEngine] mode={mode} | history={len(history)} turns | msg={message[:60]!r}")

        # Use non-JSON mode — we want plain conversational text
        if self.llm.backend == "groq":
            raw = await self.llm._call_groq(full_prompt, json_mode=False)
        else:
            raw = await self.llm._call_ollama(full_prompt, self.llm.ollama_model, json_mode=False)

        reply = raw.strip()

        # Persist to MongoDB
        if conversation_id:
            self.memory.append_message(conversation_id, role="user",      content=message, mode=mode)
            self.memory.append_message(conversation_id, role="assistant",  content=reply,   mode=mode)

        return reply

    async def chat_stream(
        self,
        message: str,
        mode: str = "auto",
        source: str = "auto",
        history: list[dict] = None,
        conversation_id: str = "",
        memory_context: str = "",
        rag_context: str = "",
        web_context: str = "",
    ) -> AsyncGenerator[str, None]:
        reply = await self.chat(
            message=message, mode=mode, source=source, history=history,
            conversation_id=conversation_id,
            memory_context=memory_context, rag_context=rag_context, web_context=web_context,
        )
        words = reply.split(" ")
        for i, word in enumerate(words):
            yield word + (" " if i < len(words) - 1 else "")

    def _build_prompt(self, system_prompt: str, history: list[dict], new_message: str) -> str:
        """
        Build a single prompt string from system prompt + conversation history + new message.
        Format compatible with the existing LLMEngine.generate_async().
        """
        parts = [system_prompt, "\n\n--- CONVERSATION ---"]

        for turn in history[-10:]:  # keep last 10 turns to avoid token overflow
            role = turn.get("role", "user")
            content = turn.get("content", "")
            if role == "user":
                parts.append(f"User: {content}")
            elif role == "assistant":
                parts.append(f"Assistant: {content}")

        parts.append(f"User: {new_message}")
        parts.append("Assistant:")

        return "\n".join(parts)
