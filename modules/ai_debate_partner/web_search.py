"""
web_search.py — Tavily web search for the AI Debate Partner
============================================================
Provides real-time web context to complement RAG or answer
questions the document doesn't cover.
"""

import logging
import os

log = logging.getLogger("debate.web")


def _get_tavily_keys() -> list[str]:
    """Collect all configured Tavily API keys in priority order."""
    return [
        k for k in [
            os.getenv("TAVILY_API_KEY", ""),
            os.getenv("TAVILY_API_KEY2", ""),
        ] if k
    ]


async def search(query: str, max_results: int = 3) -> str:
    """
    Search the web using Tavily and return a clean context string.
    Rotates to TAVILY_API_KEY2 if the first key hits its rate limit.
    Returns empty string on failure.
    """
    import asyncio

    def _sync_search():
        from tavily import TavilyClient

        keys = _get_tavily_keys()
        if not keys:
            log.warning("No TAVILY_API_KEY set — web search disabled")
            return "", 0

        last_error = None
        for i, key in enumerate(keys):
            try:
                client = TavilyClient(api_key=key)
                result = client.search(query, max_results=max_results, search_depth="basic")

                results = result.get("results", [])
                parts = []
                for r in results:
                    title   = r.get("title", "")
                    content = r.get("content", "").strip()
                    url     = r.get("url", "")
                    if content:
                        parts.append(f"[{title}]\n{content}\nSource: {url}")

                if i > 0:
                    log.info(f"Tavily key {i + 1} succeeded after key rotation")
                return "\n\n".join(parts), len(results)

            except Exception as e:
                log.warning(f"Tavily key {i + 1} failed: {e} — {'trying next key' if i + 1 < len(keys) else 'no more keys'}")
                last_error = e

        raise last_error

    try:
        context, result_count = await asyncio.to_thread(_sync_search)
        if context:
            log.info(f"Web search returned {result_count} results for: '{query[:50]}'")
        return context
    except Exception as e:
        log.error(f"Web search failed on all keys: {e}")
        return ""
