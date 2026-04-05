"""
diagram_generator.py  — v3: Improved keyword extraction + better labels
========================================================================
Fixes:
  1. Smart keyword extraction from bullet text
  2. Better label length (25 chars, no mid-word cuts)
  3. Stop words removal for cleaner labels
  4. Title extraction for root nodes

Supported visual_hint values:
  flowchart  → Mermaid flowchart TD
  mindmap    → Mermaid mindmap
  timeline   → Mermaid timeline
  comparison → Mermaid quadrant or table-style flow
  process    → Mermaid flowchart with loop arrow
  hierarchy  → Mermaid flowchart TD (tree shape)
  none       → skip diagram for this slide
"""

import logging
import tempfile
import re
from pathlib import Path
import sys

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from modules.config_loader import CONFIG

log = logging.getLogger("diagram_generator")
if not log.hasHandlers():
    logging.basicConfig(level=logging.INFO,
                        format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
                        datefmt="%H:%M:%S")


# ── Stop words for keyword extraction ─────────────────────────────────────────

STOP_WORDS = {
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare',
    'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as',
    'into', 'through', 'during', 'before', 'after', 'above', 'below',
    'between', 'under', 'again', 'further', 'then', 'once', 'here',
    'there', 'when', 'where', 'why', 'how', 'all', 'each', 'few',
    'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not',
    'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just',
    'and', 'but', 'if', 'or', 'because', 'until', 'while', 'that',
    'which', 'who', 'whom', 'this', 'these', 'those', 'what', 'its',
    'it', 'they', 'them', 'their', 'we', 'us', 'our', 'you', 'your',
    'he', 'him', 'his', 'she', 'her', 'use', 'uses', 'used', 'using',
    'also', 'well', 'back', 'even', 'still', 'way', 'take', 'come',
    'make', 'like', 'get', 'go', 'see', 'know', 'think', 'look',
}


# ── Helper functions ──────────────────────────────────────────────────────────

def _safe(text: str, max_len: int = 30) -> str:
    """Escape special characters and truncate for Mermaid labels."""
    if not text:
        return ""
    result = str(text)
    result = result.replace('"', "'")
    result = result.replace('\n', ' ')
    result = result.replace('\r', ' ')
    result = result.replace('[', '(')
    result = result.replace(']', ')')
    result = result.replace('{', '(')
    result = result.replace('}', ')')
    result = result.replace('<', '')
    result = result.replace('>', '')
    result = result.replace('|', '-')
    result = result.replace('#', '')
    result = result.replace('&', 'and')
    result = result.replace(';', '')
    result = ' '.join(result.split())
    
    # Truncate at word boundary
    if len(result) > max_len:
        truncated = result[:max_len]
        # Don't cut mid-word
        if ' ' in truncated:
            truncated = truncated.rsplit(' ', 1)[0]
        result = truncated.strip()
    
    return result


def _extract_keyword(text: str, max_len: int = 28) -> str:
    """
    Extract a clean keyword/concept from bullet text.
    """
    if not text:
        return ""
    
    s = str(text).strip()
    
    # Remove markdown formatting
    s = s.replace("**", "").replace("*", "").replace("`", "")
    
    # Split into words
    words = s.split()
    if not words:
        return ""
    
    # Strategy 1: Look for quoted terms or terms in parentheses
    quoted = re.findall(r'"([^"]+)"|\'([^\']+)\'|\(([^)]+)\)', s)
    if quoted:
        for match in quoted:
            term = next((m for m in match if m), None)
            if term and 3 < len(term) <= 30:
                return term.title()
    
    # Strategy 2: If has colon, extract the KEY part
    if ':' in s:
        before_colon = s.split(':', 1)[0].strip()
        after_colon = s.split(':', 1)[1].strip()
        
        # Clean both parts
        before_words = [w for w in before_colon.split() if w.lower() not in STOP_WORDS and len(w) > 2]
        after_words = [w for w in after_colon.split() if w.lower() not in STOP_WORDS and len(w) > 2]
        
        # Prefer before_colon if it's short (likely the label)
        if 1 <= len(before_words) <= 3:
            return ' '.join(before_words).title()
        elif 1 <= len(after_words) <= 4:
            return ' '.join(after_words[:4]).title()
    
    # Strategy 3: Find capitalized compound terms (e.g., "Decision Tree", "K-Means")
    caps_pattern = r'\b[A-Z][a-z]*(?:[-\s][A-Z][a-z]*)*\b'
    caps_matches = re.findall(caps_pattern, s)
    # Filter out single common words
    good_caps = [m for m in caps_matches if len(m) > 3 and m.lower() not in STOP_WORDS]
    if good_caps:
        # Take the longest match
        best = max(good_caps, key=len)
        if len(best) <= max_len:
            return best
    
    # Strategy 4: Remove ALL stop words, take first 2-4 meaningful words
    meaningful = []
    for w in words:
        # Clean the word
        clean_w = re.sub(r'[^\w\-]', '', w)
        if clean_w.lower() not in STOP_WORDS and len(clean_w) > 2:
            meaningful.append(clean_w)
    
    if not meaningful:
        # Last resort: take first non-trivial word
        for w in words:
            clean_w = re.sub(r'[^\w\-]', '', w)
            if len(clean_w) > 3:
                return clean_w.title()
        return ""
    
    # Take 2-4 meaningful words
    keyword = ' '.join(meaningful[:3])
    
    # Title case
    keyword = keyword.title()
    
    # Truncate at word boundary if too long
    if len(keyword) > max_len:
        parts = keyword.split()
        keyword = ''
        for w in parts:
            if len(keyword) + len(w) + 1 <= max_len:
                keyword = f"{keyword} {w}".strip()
            else:
                break
    
    return keyword.strip()


def _to_diagram_labels(bullets: list[str], max_len: int = 28) -> list[str]:
    """
    Convert bullet texts into SHORT diagram labels.
    Returns unique, clean keywords for diagram nodes.
    """
    out = []
    seen = set()
    
    for b in bullets:
        text = (b if isinstance(b, str) else str(b)).strip()
        if not text:
            continue
        
        keyword = _extract_keyword(text, max_len)
        
        # Final filter: skip if it's just a stop word or too short
        if not keyword or len(keyword) < 3:
            continue
        if keyword.lower() in STOP_WORDS:
            continue
        
        # Skip duplicates
        key_lower = keyword.lower()
        if key_lower not in seen:
            seen.add(key_lower)
            out.append(keyword)
    
    return out


def _extract_title_keyword(title: str, max_len: int = 25) -> str:
    """Extract a short keyword from slide title for diagram root."""
    if not title:
        return "Topic"
    
    # Remove common prefixes
    prefixes = ['introduction to ', 'overview of ', 'understanding ', 'what is ', 
                'how to ', 'guide to ', 'basics of ', 'summary of ', 'comparison of ']
    lower = title.lower()
    for prefix in prefixes:
        if lower.startswith(prefix):
            title = title[len(prefix):]
            break
    
    # If title has colon, take the part that's more specific
    if ':' in title:
        parts = title.split(':', 1)
        title = parts[1].strip() if len(parts[1].strip()) > 3 else parts[0].strip()
    
    return _safe(title.strip().title(), max_len)


# ── Mermaid generators ────────────────────────────────────────────────────────

def _mermaid_flowchart(title: str, steps: list[str]) -> str:
    labels = _to_diagram_labels(steps, max_len=28)
    if not labels:
        return ""
    
    lines = ["flowchart TD"]
    ids = [chr(65 + i) for i in range(min(len(labels), 7))]
    
    for nid, step in zip(ids, labels):
        lines.append(f'  {nid}["{_safe(step, 28)}"]')
    
    for i in range(len(ids) - 1):
        lines.append(f"  {ids[i]} --> {ids[i+1]}")
    
    return "\n".join(lines)


def _mermaid_mindmap(title: str, items: list[str], key_message: str = "") -> str:
    # Use key_message or extract keyword from title
    root = key_message.strip() if key_message.strip() else _extract_title_keyword(title)
    root = _safe(root, 25)
    
    labels = _to_diagram_labels(items, max_len=25)
    if not labels:
        return ""
    
    lines = ["mindmap", f'  root(("{root}"))']
    for item in labels[:6]:
        lines.append(f'    ("{_safe(item, 25)}")')
    
    return "\n".join(lines)


def _mermaid_timeline(title: str, items: list[str]) -> str:
    labels = _to_diagram_labels(items, max_len=25)
    if not labels:
        return ""
    
    short_title = _extract_title_keyword(title, 30)
    lines = ["timeline", f"  title {short_title}"]
    
    for i, item in enumerate(labels[:6]):
        lines.append(f"  Step {i+1} : {_safe(item, 25)}")
    
    return "\n".join(lines)


def _mermaid_comparison(title: str, items: list[str]) -> str:
    """Two-branch flowchart — split items into two groups."""
    labels = _to_diagram_labels(items, max_len=25)
    if len(labels) < 2:
        return _mermaid_flowchart(title, items)
    
    mid = (len(labels) + 1) // 2
    left = labels[:mid]
    right = labels[mid:]
    
    root = _extract_title_keyword(title, 22)
    
    lines = ["flowchart TD", f'  ROOT["{root}"]']
    lines.append(f'  L["{_safe(left[0], 22)}"]')
    lines.append(f'  R["{_safe(right[0] if right else "Option B", 22)}"]')
    lines.append("  ROOT --> L")
    lines.append("  ROOT --> R")
    
    for i, item in enumerate(left[1:4], 1):  # Limit to 3 sub-items
        lines.append(f'  L{i}["{_safe(item, 22)}"]')
        lines.append(f"  L --> L{i}")
    
    for i, item in enumerate(right[1:4], 1):
        lines.append(f'  R{i}["{_safe(item, 22)}"]')
        lines.append(f"  R --> R{i}")
    
    return "\n".join(lines)


def _mermaid_process(title: str, steps: list[str]) -> str:
    """Cyclical process — flowchart with return arrow."""
    labels = _to_diagram_labels(steps, max_len=25)
    if not labels:
        return ""
    
    lines = ["flowchart TD"]
    ids = [chr(65 + i) for i in range(min(len(labels), 6))]
    
    for nid, step in zip(ids, labels):
        lines.append(f'  {nid}["{_safe(step, 25)}"]')
    
    for i in range(len(ids) - 1):
        lines.append(f"  {ids[i]} --> {ids[i+1]}")
    
    if len(ids) >= 2:
        lines.append(f"  {ids[-1]} -.->|repeat| {ids[0]}")
    
    return "\n".join(lines)


def _mermaid_hierarchy(title: str, items: list[str], key_message: str = "") -> str:
    """Tree hierarchy — root fans out to children."""
    root = key_message.strip() if key_message.strip() else _extract_title_keyword(title)
    root = _safe(root, 25)
    
    labels = _to_diagram_labels(items, max_len=25)
    if not labels:
        return ""
    
    lines = ["flowchart TD", f'  ROOT["{root}"]']
    
    for i, item in enumerate(labels[:6]):
        nid = f"N{i}"
        lines.append(f'  {nid}["{_safe(item, 25)}"]')
        lines.append(f"  ROOT --> {nid}")
    
    return "\n".join(lines)




def generate_all_diagrams(slides, theme_color: str = "#1F6FEB",
                          tmp_dir: str = None) -> dict[int, dict]:
    """
    For each content slide, generate a diagram using slide.visual_hint.
    Returns: { slide_index: {"mermaid": str, "png": str|None} }
    """
    tmp = Path(tmp_dir or tempfile.mkdtemp())
    tmp.mkdir(parents=True, exist_ok=True)
    diagrams: dict[int, dict] = {}

    _fallback_cycle = ["flowchart", "mindmap", "timeline", "comparison", "process", "hierarchy"]
    _used_hints: list[str] = []

    for i, slide in enumerate(slides):
        # Skip title slides and slides with no bullets
        if slide.slide_type == "title" or not slide.bullets:
            continue
        # Skip if slide already uses a PDF image
        if getattr(slide, 'image_id', None):
            continue

        hint = (getattr(slide, 'visual_hint', 'none') or 'none').lower().strip()

        # If hint is "none", skip
        if hint == "none":
            continue

        # If this hint was already used by the previous slide, rotate
        if _used_hints and hint == _used_hints[-1]:
            for candidate in _fallback_cycle:
                if candidate != hint:
                    hint = candidate
                    break

        # Extract bullet texts
        # Extract bullet texts
        steps = []
        for b in slide.bullets[:6]:
            txt = b.get("text", "") if isinstance(b, dict) else str(b)
            if txt:
                steps.append(txt)

        # DEBUG
        labels = _to_diagram_labels(steps)
        print(f"🔍 Slide {i} '{slide.title[:30]}': {len(steps)} bullets → {len(labels)} labels")
        print(f"   Bullet[0]: {steps[0][:60] if steps else 'N/A'}...")
        print(f"   Labels: {labels}")

        if len(steps) < 2:
            continue

        title = slide.title
        key_message = getattr(slide, "key_message", "") or ""
        out_png = str(tmp / f"slide_{i}.png")
        mermaid_src: str | None = None
        png_path: str | None = None

        try:
            if hint == "flowchart":
                mermaid_src = _mermaid_flowchart(title, steps)
            elif hint == "mindmap":
                mermaid_src = _mermaid_mindmap(title, steps, key_message)
            elif hint == "timeline":
                mermaid_src = _mermaid_timeline(title, steps)
            elif hint == "comparison":
                mermaid_src = _mermaid_comparison(title, steps)
            elif hint == "process":
                mermaid_src = _mermaid_process(title, steps)
            elif hint == "hierarchy":
                mermaid_src = _mermaid_hierarchy(title, steps, key_message)
            else:
                mermaid_src = _mermaid_flowchart(title, steps)

        except Exception as e:
            log.warning(f"Diagram generation failed for slide {i} (hint={hint}): {e}")
            mermaid_src = None

        if mermaid_src:
            import base64
            import zlib
            compressed = zlib.compress(mermaid_src.encode('utf-8'), 9)
            b64 = base64.urlsafe_b64encode(compressed).decode('utf-8')
            img_url = f"https://kroki.io/mermaid/svg/{b64}"
            diagrams[i] = {"mermaid": mermaid_src, "url": img_url}
            _used_hints.append(hint)
            log.info(f"  ✔ Slide {i}: {hint} diagram generated via Kroki.")

    return diagrams