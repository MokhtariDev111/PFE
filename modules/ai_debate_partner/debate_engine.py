"""
debate_engine.py — Core chat logic and mode routing
=====================================================
Handles:
  - Mode routing (debate / explain / coach / auto)
  - Conversation history management
  - Streaming responses via the existing LLMEngine
  - Context injection (memory, RAG, web) — pluggable, added incrementally
"""

import json as _json
import logging
import re
from typing import AsyncGenerator

import httpx

_SMALL_TALK_RE = re.compile(
    r"^\s*(hi+|hello+|hey+|howdy|sup|what'?s up|how are you|how r u|"
    r"good morning|good afternoon|good evening|bonjour|salut|ça va|"
    r"merci|thank(s| you)|bye|goodbye|ok+|okay|lol|haha|nice|cool|"
    r"great|wow|yes|no|sure|who are you|what are you|are you (an )?ai)\b[!?.]*\s*$",
    re.IGNORECASE,
)

def _skip_web_search(message: str, mode: str = "") -> bool:
    """Return True when a web search would add nothing (small talk, greetings, very short messages, virtual mode)."""
    if mode == "virtual":
        return True
    msg = message.strip()
    return len(msg) < 25 or bool(_SMALL_TALK_RE.match(msg))

from modules.doc_generation.llm import LLMEngine
from modules.ai_debate_partner.prompts import build_system_prompt
from modules.ai_debate_partner.memory_store import MemoryStore

log = logging.getLogger("debate.engine")

VALID_MODES = {"debate", "explain", "coach", "auto", "virtual"}


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

    def __init__(self, llm_engine: LLMEngine = None, namespace: str = "aria"):
        self.llm    = llm_engine or LLMEngine(namespace=namespace)
        self.memory = MemoryStore()

    # ── Internal helpers ──────────────────────────────────────────────────────

    async def _call_llm_plain(self, prompt: str) -> str:
        """Call Groq with json_mode=False (plain conversational text)."""
        return await self.llm._call_groq(prompt, json_mode=False)

    async def _prepare_prompt(
        self,
        message: str,
        mode: str,
        source: str,
        history: list[dict],
        conversation_id: str,
        memory_context: str,
        rag_context: str,
        web_context: str,
        language: str,
    ) -> tuple[str, str]:
        """
        Resolve all context sources and build the final prompt.
        Returns (resolved_mode, full_prompt).
        """
        mode = mode if mode in VALID_MODES else "auto"

        # Load history from DB if conversation_id given and no history passed
        if conversation_id and not history:
            history = self.memory.get_history(conversation_id)
        history = history or []

        # Build memory context from profile if not provided
        if not memory_context:
            memory_context = self.memory.build_memory_context()

        # RAG — runs for "doc" and "mix" only (skipped when source is "web")
        if not rag_context and conversation_id and source in ("doc", "mix"):
            try:
                from modules.ai_debate_partner.rag_retriever import retrieve, index_exists
                if index_exists(conversation_id):
                    rag_context = retrieve(conversation_id, message, top_k=4)
            except Exception as e:
                log.warning(f"RAG retrieval skipped: {e}")

        # Web search — runs for "web" (always) and "mix" (alongside RAG)
        # Skip for small talk / very short messages where a search adds nothing
        if not web_context and source in ("web", "mix") and not _skip_web_search(message, mode):
            try:
                from modules.ai_debate_partner.web_search import search
                web_context = await search(message, max_results=3)
            except Exception as e:
                log.warning(f"Web search skipped: {e}")

        # Slash command tools — /youtube and /wikipedia override web_context
        # /animation is handled by the dedicated API endpoint, not here
        msg_lower = message.lower()
        if msg_lower.startswith("/animation"):
            return mode, "__ANIMATION_COMMAND__"
        if "/youtube" in msg_lower:
            try:
                from modules.ai_debate_partner.web_tools import search_youtube, format_youtube_results
                query = msg_lower.replace("/youtube", "").strip() or message
                results = await search_youtube(query, max_results=3)
                if results:
                    web_context = format_youtube_results(results)
                    log.info(f"[/youtube] {len(results)} results for '{query}'")
            except Exception as e:
                log.warning(f"/youtube tool skipped: {e}")
        elif "/wikipedia" in msg_lower:
            try:
                from modules.ai_debate_partner.web_tools import search_wikipedia, format_wikipedia_result
                query = msg_lower.replace("/wikipedia", "").strip() or message
                result = await search_wikipedia(query)
                if result:
                    web_context = format_wikipedia_result(result)
                    log.info(f"[/wikipedia] result for '{query}'")
            except Exception as e:
                log.warning(f"/wikipedia tool skipped: {e}")
        system_prompt = build_system_prompt(
            mode=mode,
            memory_context=memory_context,
            rag_context=rag_context,
            web_context=web_context,
            language=language,
        )
        full_prompt = self._build_prompt(system_prompt, history, message)
        log.info(f"[DebateEngine] mode={mode} | history={len(history)} turns | msg={message[:60]!r}")
        return mode, full_prompt

    async def _stream_groq(self, prompt: str) -> AsyncGenerator[str, None]:
        """Yield tokens from Groq using server-sent events (true streaming)."""
        headers = {
            "Authorization": f"Bearer {self.llm.groq_api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": self.llm.groq_model,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": self.llm.temp,
            "max_tokens": 4096,
            "stream": True,
        }
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                async with client.stream("POST", self.llm.groq_url, json=payload, headers=headers) as resp:
                    resp.raise_for_status()
                    async for line in resp.aiter_lines():
                        if not line.startswith("data: "):
                            continue
                        data = line[6:]
                        if data.strip() == "[DONE]":
                            break
                        try:
                            chunk = _json.loads(data)
                            token = chunk["choices"][0]["delta"].get("content", "")
                            if token:
                                yield token
                        except Exception:
                            pass
        except Exception as e:
            log.error(f"Groq stream failed: {e}")

    # ── Public API ────────────────────────────────────────────────────────────

    async def chat(
        self,
        message: str,
        mode: str = "auto",
        source: str = "mix",        # "web" | "doc" | "mix"
        history: list[dict] = None,
        conversation_id: str = "",
        memory_context: str = "",
        rag_context: str = "",
        web_context: str = "",
        language: str = "en",       # "en" | "fr"
    ) -> str:
        """
        Generate a single (non-streaming) response.
        If conversation_id is provided, loads history from MongoDB and saves the exchange.
        """
        mode, full_prompt = await self._prepare_prompt(
            message, mode, source, history, conversation_id,
            memory_context, rag_context, web_context, language,
        )

        if full_prompt == "__ANIMATION_COMMAND__":
            return "Use the /animation command from the Aria chat interface to generate a Manim animation."

        reply = (await self._call_llm_plain(full_prompt)).strip()

        # Persist to MongoDB
        if conversation_id:
            self.memory.append_message(conversation_id, role="user",      content=message, mode=mode)
            self.memory.append_message(conversation_id, role="assistant",  content=reply,   mode=mode)

        return reply

    async def chat_stream(
        self,
        message: str,
        mode: str = "auto",
        source: str = "mix",        # "web" | "doc" | "mix"
        history: list[dict] = None,
        conversation_id: str = "",
        memory_context: str = "",
        rag_context: str = "",
        web_context: str = "",
        language: str = "en",       # "en" | "fr"
    ) -> AsyncGenerator[str, None]:
        """
        Stream the response token-by-token.
        Persists the full reply to MongoDB after the stream completes.
        """
        mode, full_prompt = await self._prepare_prompt(
            message, mode, source, history, conversation_id,
            memory_context, rag_context, web_context, language,
        )

        if full_prompt == "__ANIMATION_COMMAND__":
            yield "Use the /animation command from the Aria chat interface to generate a Manim animation."
            return

        streamer = self._stream_groq(full_prompt)

        buffer: list[str] = []
        async for token in streamer:
            buffer.append(token)
            yield token

        # Persist full assembled reply after stream ends
        if conversation_id and buffer:
            reply = "".join(buffer).strip()
            self.memory.append_message(conversation_id, role="user",      content=message, mode=mode)
            self.memory.append_message(conversation_id, role="assistant",  content=reply,   mode=mode)

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
