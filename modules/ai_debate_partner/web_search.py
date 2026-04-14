"""
web_search.py — Tavily web search for the AI Debate Partner
============================================================
Provides real-time web context to complement RAG or answer
questions the document doesn't cover.
"""

import logging
import os

log = logging.getLogger("debate.web")


async def search(query: str, max_results: int = 3) -> str:
    """
    Search the web using Tavily and return a clean context string.
    Returns empty string on failure.
    """
    import asyncio

    def _sync_search():
        from tavily import TavilyClient
        api_key = os.getenv("TAVILY_API_KEY", "")
        if not api_key:
            log.warning("TAVILY_API_KEY not set — web search disabled")
            return ""

        client = TavilyClient(api_key=api_key)
        result = client.search(query, max_results=max_results, search_depth="basic")

        parts = []
        for r in result.get("results", []):
            title   = r.get("title", "")
            content = r.get("content", "").strip()
            url     = r.get("url", "")
            if content:
                parts.append(f"[{title}]\n{content}\nSource: {url}")

        return "\n\n".join(parts)

    try:
        context = await asyncio.to_thread(_sync_search)
        if context:
            log.info(f"Web search returned {context.count('[')  } results for: '{query[:50]}'")
        return context
    except Exception as e:
        log.error(f"Web search failed: {e}")
        return ""
