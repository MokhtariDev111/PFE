"""
Prompt–section alignment for presentation outlines.
Drops outline rows whose headings are dominated by topics the user did not ask for.
"""

from __future__ import annotations

import re
import logging

log = logging.getLogger("prompt_alignment")

_STOPWORDS = frozenset(
    """
    a an the and or but if in on at to for of as is are was were be been being
    with from by into about over after before between through during under again
    further then once here there when where why how all both each few more most
    other some such no nor not only own same so than too very can will just don
    should now what which who this that these those it its our your my we they
    me him her them do does did doing done have has had having get got getting
    make made using use used new old any way also only even very much many
    """.split()
)

# If the section heading matches a pattern, the prompt must mention at least one hint.
_SECTION_TOPIC_GATE: list[tuple[re.Pattern, tuple[str, ...]]] = [
    (
        re.compile(
            r"\bdecision\s+trees?\b|\brandom\s+forest\b|\bcart\b",
            re.I,
        ),
        ("tree", "trees", "decision", "forest", "cart", "partition", "split", "gini", "entropy"),
    ),
    (
        re.compile(
            r"\bkernelized\b|\bsupport\s+vector\b|\bsvm\b|\bhyperplane\s+classifier\b",
            re.I,
        ),
        ("svm", "vector", "kernel", "margin", "hyperplane", "support vector"),
    ),
    (
        re.compile(r"\bk[\s-]?nearest\b|\bknn\b", re.I),
        ("neighbor", "neighbours", "knn", "nearest", "instance"),
    ),
    (
        re.compile(r"\bnaive\s+bayes\b", re.I),
        ("bayes", "naive", "generative"),
    ),
    (
        re.compile(r"\bneural\s+net", re.I),
        ("neural", "deep", "network", "cnn", "rnn"),
    ),
    (
        re.compile(r"\bgradient\s+boost|\bxgboost\b|\badaboost\b", re.I),
        ("boost", "boosting", "xgboost", "adaboost", "gradient"),
    ),
    (
        re.compile(r"\bclustering\b|\bk[\s-]?means\b", re.I),
        ("cluster", "k-means", "kmeans", "centroid"),
    ),
]


def significant_focus_terms(prompt: str) -> list[str]:
    """Content words from the user prompt (for matching section titles)."""
    raw = re.findall(r"[a-z][a-z0-9]+", (prompt or "").lower())
    weak = _STOPWORDS | {
        "model",
        "models",
        "machine",
        "learning",
        "introduction",
        "overview",
        "slide",
        "slides",
        "presentation",
        "talk",
        "lecture",
        "explain",
        "describe",
        "about",
        "please",
    }
    out: list[str] = []
    seen: set[str] = set()
    for t in raw:
        if len(t) < 3 or t in weak:
            continue
        if t not in seen:
            seen.add(t)
            out.append(t)
    return out


def relevance_threshold_for_prompt(prompt: str) -> float:
    """Stricter similarity for short, focused queries."""
    n = len((prompt or "").split())
    if n <= 5:
        return 0.71
    if n <= 12:
        return 0.66
    return 0.60


def section_passes_topic_gate(section: str, prompt: str) -> bool:
    """False if the heading is clearly about another algorithm family."""
    pl = (prompt or "").lower()
    sl = (section or "").lower()
    for pat, hints in _SECTION_TOPIC_GATE:
        if pat.search(sl):
            if not any(h in pl for h in hints):
                log.info(f"  Dropping section (topic gate): '{section[:50]}'")
                return False
    return True


def section_matches_focus_terms(section: str, terms: list[str]) -> bool:
    """True if a focus term appears as a whole word in the section title."""
    if not terms:
        return False
    sl = (section or "").lower()
    for t in terms:
        if re.search(r"\b" + re.escape(t) + r"\b", sl):
            return True
    return False


def _prompt_is_linear_model_family(prompt: str) -> bool:
    pl = (prompt or "").lower()
    return bool(
        re.search(
            r"\blinear\b|\blogistic\b|\bregression\b|\bridge\b|\blasso\b|\bols\b|"
            r"ordinary\s+least",
            pl,
        )
    )


# Headings that usually belong to the same textbook thread as linear / GLM models
_LINEAR_THREAD = re.compile(
    r"\blinear\b|\blogistic\b|\bregression\b|\bridge\b|\blasso\b|\bpolynomial\b|"
    r"\binteraction\b|\bcoefficient\b|\bregulari[sz]ation\b|\bnonlinear\b|"
    r"\bdiscreti[sz]ation\b|\bbinning\b|\bunivariate\b|\bfeature\s+selection\b|"
    r"model[\s-]based\s+feature",
    re.I,
)


def keep_section_for_prompt(
    section: str,
    prompt: str,
    relevance: float,
    threshold: float,
) -> bool:
    """
    Combine embedding score, topic gate, and title overlap.
    Sections whose titles echo the prompt get a slightly lower bar.
    """
    if not section_passes_topic_gate(section, prompt):
        return False

    terms = significant_focus_terms(prompt)
    if section_matches_focus_terms(section, terms):
        adj = min(threshold, 0.58)
        ok = relevance >= adj
        if not ok:
            log.info(
                f"  Dropping section (low relevance {relevance:.2f} vs {adj:.2f}): "
                f"'{section[:50]}'"
            )
        return ok

    if _prompt_is_linear_model_family(prompt) and _LINEAR_THREAD.search(section):
        adj = min(threshold, 0.635)
        ok = relevance >= adj
        if not ok:
            log.info(
                f"  Dropping section (low relevance {relevance:.2f} vs {adj:.2f}): "
                f"'{section[:50]}'"
            )
        return ok

    ok = relevance >= threshold
    if not ok:
        log.info(
            f"  Dropping section (low relevance {relevance:.2f} vs {threshold:.2f}): "
            f"'{section[:50]}'"
        )
    return ok


def enforce_slide_list_length(slides: list[dict], target: int) -> list[dict]:
    """
    Trim to exactly `target` slides: keep first (title) and last (usually summary),
    shorten the middle. No-op if already short enough.
    """
    if not slides or target < 1 or len(slides) <= target:
        return slides
    first = slides[0]
    last = slides[-1]
    mid = slides[1:-1]
    need_mid = max(0, target - 2)
    if len(mid) > need_mid:
        mid = mid[:need_mid]
    out = [first] + mid + [last]
    log.info(f"  Enforced slide count: {len(slides)} → {len(out)} (target={target})")
    return out
