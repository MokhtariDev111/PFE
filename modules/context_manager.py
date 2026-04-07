"""
context_manager.py — Smart Context Preparation
===============================================
Prepares retrieved chunks for LLM consumption with:
- Relevance-based prioritization
- Sentence-boundary-aware truncation
- Token budget optimization
"""

import logging
import re
from pathlib import Path
import sys

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

log = logging.getLogger("context_manager")

# Approximate tokens (1 token ≈ 4 chars for English)
CHARS_PER_TOKEN = 4


def estimate_tokens(text: str) -> int:
    """Rough token estimate without loading tokenizer."""
    return len(text) // CHARS_PER_TOKEN


def truncate_to_sentence(text: str, max_chars: int) -> str:
    """
    Truncate text at sentence boundary, not mid-word.
    """
    if len(text) <= max_chars:
        return text
    
    # Find the last sentence-ending punctuation before max_chars
    truncated = text[:max_chars]
    
    # Look for sentence boundaries: . ! ? followed by space or end
    last_period = max(
        truncated.rfind('. '),
        truncated.rfind('! '),
        truncated.rfind('? '),
        truncated.rfind('.\n'),
    )
    
    if last_period > max_chars * 0.5:  # At least keep 50% of content
        return truncated[:last_period + 1].strip()
    
    # Fallback: truncate at last space to avoid breaking words
    last_space = truncated.rfind(' ')
    if last_space > max_chars * 0.7:
        return truncated[:last_space].strip() + "..."
    
    return truncated.strip() + "..."


def format_chunk(chunk, index: int, include_metadata: bool = True) -> str:
    """
    Format a single chunk for LLM context.
    Includes section_heading in metadata so the LLM knows which part of the
    document this content comes from (Bug D / Bug F support).
    """
    source  = getattr(chunk, 'source', 'Unknown')
    page    = getattr(chunk, 'page', 0)
    text    = getattr(chunk, 'text', str(chunk))
    section = getattr(chunk, 'section_heading', '') or ''

    if include_metadata:
        if section:
            return f"[Source: {source}, Page {page}, Section: {section}]\n{text}"
        return f"[Source: {source}, Page {page}]\n{text}"
    return text


def prepare_context(
    chunks: list,
    max_tokens: int = 2500,
    max_chars: int = None,
    include_metadata: bool = True,
    deduplicate: bool = True,
) -> str:
    """
    Prepare retrieved chunks for LLM context window.
    
    Args:
        chunks: List of TextChunk objects (ordered by relevance)
        max_tokens: Maximum token budget (default 2500 ≈ safe for 4K context)
        max_chars: Override character limit (default: max_tokens * 4)
        include_metadata: Include source/page info
        deduplicate: Remove near-duplicate sentences
    
    Returns:
        Formatted context string optimized for LLM consumption
    """
    if not chunks:
        return ""
    
    max_chars = max_chars or (max_tokens * CHARS_PER_TOKEN)
    
    # Format all chunks (already ordered by relevance from retriever)
    formatted_chunks = []
    seen_sentences = set()
    
    for i, chunk in enumerate(chunks):
        text = getattr(chunk, 'text', str(chunk))
        
        # Optional deduplication at sentence level
        if deduplicate:
            sentences = re.split(r'(?<=[.!?])\s+', text)
            unique_sentences = []
            for sent in sentences:
                sent_normalized = sent.lower().strip()[:50]  # First 50 chars as key
                if sent_normalized not in seen_sentences:
                    seen_sentences.add(sent_normalized)
                    unique_sentences.append(sent)
            text = ' '.join(unique_sentences)
        
        if text.strip():
            formatted = format_chunk(chunk, i, include_metadata)
            formatted_chunks.append(formatted)
    
    # Build context respecting token budget
    context_parts = []
    current_chars = 0
    
    for chunk_text in formatted_chunks:
        chunk_chars = len(chunk_text)
        
        if current_chars + chunk_chars <= max_chars:
            # Fits entirely
            context_parts.append(chunk_text)
            current_chars += chunk_chars + 2  # +2 for separator
        elif current_chars < max_chars * 0.8:
            # Partially fits — truncate at sentence boundary
            remaining = max_chars - current_chars - 50  # Leave buffer
            if remaining > 200:  # Only include if meaningful content remains
                truncated = truncate_to_sentence(chunk_text, remaining)
                context_parts.append(truncated)
            break
        else:
            # Budget exhausted
            break
    
    context = "\n\n".join(context_parts)
    
    log.info(
        f"Context prepared: {len(chunks)} chunks → {len(context_parts)} used, "
        f"{len(context)} chars ({estimate_tokens(context)} tokens)"
    )
    
    return context


def prepare_context_for_slides(
    chunks: list,
    num_slides: int,
    tokens_per_slide: int = 600,
) -> str:
    """
    Prepare context scaled to presentation size.

    Bug D fix: the old hard cap of 3500 tokens cut off large sections like
    Decision Trees (13 pages ≈ 20 000+ chars). The new budget:
      - Base: 2000 tokens (enough for a short topic)
      - Per-slide addition: 600 tokens (was 400)
      - Cap: 8000 tokens — safe for Groq llama-3.3-70b (128k context window)
        and still well within Ollama's typical 4096-token context since the
        context is split per-slide, not sent all at once.

    The effective per-slide context (passed to _prepare_context in the engine)
    is a 600-token window, so this cap only matters for the global retrieval
    pool used before per-slide sub-queries.
    """
    base_tokens   = 2000
    scaled_tokens = base_tokens + (num_slides * tokens_per_slide)
    # Bug 1 fix: raised from 3500 → 6000.  Per-section generation keeps
    # individual calls small, so this cap only constrains the global pool.
    max_tokens    = min(scaled_tokens, 6000)

    log.info(f"Context budget for {num_slides} slides: {max_tokens} tokens")

    return prepare_context(chunks, max_tokens=max_tokens)

def extract_section_outline(chunks: list) -> list[str]:
    """
    Extract unique ordered section headings from retrieved chunks.

    Bug 3 fix: returns the sub-section name (after " > ") rather than the
    full "Parent > Child" path.  This produces cleaner slide titles and
    simpler section labels for the LLM prompt.
    """
    seen_full = set()   # track full headings to avoid duplicates
    seen_sub  = set()   # track sub-section names to avoid duplicate labels
    sections  = []
    for chunk in chunks:
        heading = getattr(chunk, 'section_heading', '') or ''
        if not heading or heading in seen_full:
            continue
        seen_full.add(heading)
        # Extract sub-section part for a cleaner label
        sub = heading.split(" > ", 1)[-1].strip() if " > " in heading else heading
        if sub and sub not in seen_sub:
            seen_sub.add(sub)
            sections.append(sub)
    log.info(f"Section outline: {len(sections)} unique sections from {len(chunks)} chunks")
    return sections
