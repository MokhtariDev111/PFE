"""
web_tools.py — YouTube and Wikipedia search for Aria
=====================================================
YouTube  : searches by query, returns top videos sorted by view count
Wikipedia: fetches article summary + URL for a given topic
"""

import asyncio
import logging
import os
import re

log = logging.getLogger("debate.web_tools")


# ─────────────────────────────────────────────────────────────────────────────
# YOUTUBE
# ─────────────────────────────────────────────────────────────────────────────

async def search_youtube(query: str, max_results: int = 3) -> list[dict]:
    """
    Search YouTube for educational videos matching the query.
    Returns a list of dicts: {title, url, channel, views, thumbnail}
    Sorted by view count descending.
    """
    api_key = os.getenv("YOUTUBE_API_KEY", "")
    if not api_key:
        log.warning("YOUTUBE_API_KEY not set")
        return []

    def _sync():
        import httpx
        # Step 1: search
        search_url = "https://www.googleapis.com/youtube/v3/search"
        params = {
            "part": "snippet",
            "q": query,
            "type": "video",
            "maxResults": max_results * 2,  # fetch more to sort by views
            "relevanceLanguage": "en",
            "key": api_key,
        }
        r = httpx.get(search_url, params=params, timeout=10)
        r.raise_for_status()
        items = r.json().get("items", [])
        if not items:
            return []

        video_ids = [it["id"]["videoId"] for it in items if "videoId" in it.get("id", {})]
        if not video_ids:
            return []

        # Step 2: get statistics (view count)
        stats_url = "https://www.googleapis.com/youtube/v3/videos"
        stats_params = {
            "part": "statistics,snippet",
            "id": ",".join(video_ids),
            "key": api_key,
        }
        rs = httpx.get(stats_url, params=stats_params, timeout=10)
        rs.raise_for_status()
        stats_items = rs.json().get("items", [])

        results = []
        for it in stats_items:
            vid_id   = it["id"]
            snippet  = it.get("snippet", {})
            stats    = it.get("statistics", {})
            views    = int(stats.get("viewCount", 0))
            results.append({
                "title":     snippet.get("title", ""),
                "url":       f"https://www.youtube.com/watch?v={vid_id}",
                "channel":   snippet.get("channelTitle", ""),
                "views":     views,
                "views_fmt": _fmt_views(views),
                "thumbnail": snippet.get("thumbnails", {}).get("medium", {}).get("url", ""),
            })

        # Sort by views descending, return top max_results
        results.sort(key=lambda x: x["views"], reverse=True)
        return results[:max_results]

    try:
        return await asyncio.to_thread(_sync)
    except Exception as e:
        log.error(f"YouTube search failed: {e}")
        return []


def _fmt_views(n: int) -> str:
    if n >= 1_000_000:
        return f"{n/1_000_000:.1f}M views"
    if n >= 1_000:
        return f"{n/1_000:.0f}K views"
    return f"{n} views"


def format_youtube_results(results: list[dict]) -> str:
    """Format YouTube results as a readable string for the LLM context."""
    if not results:
        return ""
    lines = [
        "YOUTUBE SEARCH RESULTS — you MUST include these exact URLs in your response, as clickable links:",
    ]
    for i, r in enumerate(results, 1):
        lines.append(f"{i}. {r['title']}")
        lines.append(f"   Channel: {r['channel']} | {r['views_fmt']}")
        lines.append(f"   URL: {r['url']}")
    lines.append("\nPresent these results to the user with the full URLs. Do not paraphrase the URLs.")
    return "\n".join(lines)


# ─────────────────────────────────────────────────────────────────────────────
# WIKIPEDIA
# ─────────────────────────────────────────────────────────────────────────────

async def search_wikipedia(query: str, sentences: int = 4) -> dict | None:
    """
    Fetch a Wikipedia article summary for the query.
    Returns {title, summary, url} or None if not found.
    """
    def _sync():
        import httpx
        headers = {"User-Agent": "TEKUP-AI-Aria/1.0 (educational project)"}
        # Use Wikipedia REST API — no key needed
        url = "https://en.wikipedia.org/api/rest_v1/page/summary/" + query.replace(" ", "_")
        r = httpx.get(url, timeout=10, follow_redirects=True, headers=headers)
        if r.status_code in (404, 403):
            # Try search API to find the right title
            search_url = "https://en.wikipedia.org/w/api.php"
            params = {
                "action": "query", "list": "search",
                "srsearch": query, "format": "json", "srlimit": 1,
            }
            rs = httpx.get(search_url, params=params, timeout=10, headers=headers)
            rs.raise_for_status()
            hits = rs.json().get("query", {}).get("search", [])
            if not hits:
                return None
            title = hits[0]["title"]
            r = httpx.get(
                f"https://en.wikipedia.org/api/rest_v1/page/summary/{title.replace(' ', '_')}",
                timeout=10, follow_redirects=True, headers=headers,
            )
        if not r.is_success:
            return None
        data = r.json()
        summary = data.get("extract", "")
        # Trim to N sentences
        sents = re.split(r'(?<=[.!?])\s+', summary)
        short  = " ".join(sents[:sentences])
        return {
            "title":   data.get("title", query),
            "summary": short,
            "url":     data.get("content_urls", {}).get("desktop", {}).get("page", ""),
        }

    try:
        return await asyncio.to_thread(_sync)
    except Exception as e:
        log.error(f"Wikipedia search failed: {e}")
        return None


def format_wikipedia_result(result: dict) -> str:
    """Format Wikipedia result as a readable string for the LLM context."""
    if not result:
        return ""
    return (
        f"WIKIPEDIA RESULT — you MUST include the URL in your response:\n"
        f"Title: {result['title']}\n"
        f"Summary: {result['summary']}\n"
        f"URL (include this exactly in your reply): {result['url']}"
    )
