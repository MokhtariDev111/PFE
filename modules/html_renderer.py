"""
html_renderer.py — Gamma-Style AI Presentation Renderer v2
============================================================
Premium quality interactive HTML presentations with:
- Smooth micro-animations
- Glass morphism effects
- Professional typography
- Responsive layouts
- Image lightbox with captions
- Mermaid diagram support
"""

import os
import re
import json
import hashlib
import logging
from pathlib import Path

log = logging.getLogger("renderer")

# ── Themes (Gamma-inspired palettes) ──────────────────────────────────────────
THEMES = {
    "obsidian": {
        "bg": "#0a0a0f", "bg2": "#12121a", "surf": "rgba(255,255,255,.04)",
        "brd": "rgba(255,255,255,.08)", "ink": "#f4f4f8", "muted": "rgba(244,244,248,.55)",
        "a": "#6366f1", "a2": "#a855f7", "a3": "#22d3ee",
        "card": "rgba(18,18,26,.7)", "dark": True
    },
    "aurora": {
        "bg": "#040d14", "bg2": "#061219", "surf": "rgba(0,255,200,.03)",
        "brd": "rgba(0,255,200,.10)", "ink": "#e8fff9", "muted": "rgba(232,255,249,.55)",
        "a": "#00e5a0", "a2": "#00cfff", "a3": "#7c3aed",
        "card": "rgba(6,18,25,.7)", "dark": True
    },
    "inferno": {
        "bg": "#0c0503", "bg2": "#140906", "surf": "rgba(255,120,0,.04)",
        "brd": "rgba(255,120,0,.10)", "ink": "#fff5ee", "muted": "rgba(255,245,238,.55)",
        "a": "#f97316", "a2": "#ef4444", "a3": "#facc15",
        "card": "rgba(20,9,6,.7)", "dark": True
    },
    "ocean": {
        "bg": "#020810", "bg2": "#031018", "surf": "rgba(56,189,248,.04)",
        "brd": "rgba(56,189,248,.10)", "ink": "#f0f9ff", "muted": "rgba(240,249,255,.55)",
        "a": "#0ea5e9", "a2": "#8b5cf6", "a3": "#10b981",
        "card": "rgba(3,16,24,.7)", "dark": True
    },
    "forest": {
        "bg": "#020905", "bg2": "#041008", "surf": "rgba(52,211,153,.04)",
        "brd": "rgba(52,211,153,.10)", "ink": "#ecfdf5", "muted": "rgba(236,253,245,.55)",
        "a": "#10b981", "a2": "#84cc16", "a3": "#f59e0b",
        "card": "rgba(4,16,8,.7)", "dark": True
    },
    "neon": {
        "bg": "#030208", "bg2": "#050310", "surf": "rgba(255,0,220,.04)",
        "brd": "rgba(255,0,220,.10)", "ink": "#fdf4ff", "muted": "rgba(253,244,255,.55)",
        "a": "#e879f9", "a2": "#22d3ee", "a3": "#facc15",
        "card": "rgba(5,3,16,.7)", "dark": True
    },
    "galaxy": {
        "bg": "#050210", "bg2": "#080318", "surf": "rgba(167,139,250,.04)",
        "brd": "rgba(167,139,250,.10)", "ink": "#f5f3ff", "muted": "rgba(245,243,255,.55)",
        "a": "#a78bfa", "a2": "#f472b6", "a3": "#38bdf8",
        "card": "rgba(8,3,24,.7)", "dark": True
    },
    "cream": {
        "bg": "#fafaf9", "bg2": "#f5f5f4", "surf": "rgba(0,0,0,.03)",
        "brd": "rgba(0,0,0,.08)", "ink": "#1c1917", "muted": "rgba(28,25,23,.60)",
        "a": "#ea580c", "a2": "#7c3aed", "a3": "#0d9488",
        "card": "rgba(255,255,255,.8)", "dark": False
    },
}

_PPTX_TO_HTML_THEME = {
    "Dark Navy": "obsidian", "Ocean Blue": "ocean", "Forest Green": "forest",
    "Inferno": "inferno", "Aurora": "aurora", "Neon": "neon",
    "Galaxy": "galaxy", "Cream": "cream",
}

_KEYS = list(THEMES.keys())

def _auto_theme(pres_id: str) -> str:
    h = int(hashlib.md5(pres_id.encode()).hexdigest()[:8], 16)
    return _KEYS[h % len(_KEYS)]

def _esc(s: str) -> str:
    return (str(s or "")).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', '&quot;').replace("'", "&#39;").replace("\n", " ")

def _esc_mermaid(s: str) -> str:
    if not s:
        return ""
    return str(s).replace("<", "&lt;")

def _rgb(h: str) -> tuple:
    h = h.lstrip("#")
    if len(h) == 3:
        h = "".join([c * 2 for c in h])
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)

# ── Slide Builders ────────────────────────────────────────────────────────────

def _slide_toc(sections: list, i: int, tot: int, t: dict) -> tuple:
    """Table of contents slide — vertical table with slide numbers and click navigation."""
    a, a2, a3 = t["a"], t["a2"], t["a3"]
    r, g, b = _rgb(a)
    num = f"{i + 1}/{tot}"

    rows = ""
    for entry in sections:
        slide_num = entry["num"]
        label     = entry["label"]
        stype     = entry["type"]
        delay     = 0.08 + (slide_num - 1) * 0.04
        ac        = a2 if slide_num % 2 == 0 else a
        ra, ga, ba = _rgb(ac)
        # slide_num - 1 because JS array is 0-indexed, but TOC slide itself is at index i
        # target index = slide_num - 1 (cover=0, toc=1, intro=2, ...)
        target_idx = slide_num - 1
        type_label = {"intro": "Introduction", "summary": "Summary", "content": "Content"}.get(stype, stype.title())
        rows += f'''<div class="toc-row" style="--delay:{delay:.2f}s;--ac:{ac};--ac-rgb:{ra},{ga},{ba}" onclick="goTo({target_idx}, true)">
          <div class="toc-num-box" style="background:rgba({ra},{ga},{ba},.15);border-color:rgba({ra},{ga},{ba},.3);color:{ac}">{slide_num:02d}</div>
          <span class="toc-row-label">{_esc(label)}</span>
          <span class="toc-type-badge" style="background:rgba({ra},{ga},{ba},.12);color:{ac}">{type_label}</span>
          <span class="toc-arrow" style="color:{ac}">›</span>
        </div>'''

    return (f'''
<section class="slide s-toc" data-idx="{i}" style="--a:{a};--a2:{a2};--a3:{a3}">
  <div class="bg-gradient subtle"></div>
  <div class="bg-orb orb-mini" style="--orb:{a}"></div>
  <div class="bg-noise"></div>
  <canvas class="slide-particles"></canvas>
  <div class="accent-bar" style="--bar:linear-gradient(90deg,{a},{a2},{a3})"></div>
  <div class="slide-inner">
    <header class="slide-header">
      <div class="slide-badge" style="--badge-c:{a}">TABLE OF CONTENTS</div>
      <h2 class="slide-title">What We'll Cover</h2>
      <div class="title-underline" style="--line-c:{a}"></div>
    </header>
    <div class="toc-table">{rows}</div>
  </div>
  <div class="slide-number">{num}</div>
</section>
'''), ""


def _slide_cover(s: dict, i: int, tot: int, t: dict, img: any) -> tuple:
    title = _esc(s.get("title", ""))
    notes = _esc(s.get("speaker_notes", ""))
    num = f"{i + 1}/{tot}"
    a, a2, a3 = t["a"], t["a2"], t["a3"]
    r, g, b = _rgb(a)
    return (f'''
<section class="slide s-cover" data-idx="{i}" style="--a:{a};--a2:{a2};--a3:{a3}">
  <div class="bg-gradient"></div>
  <div class="bg-orb orb-1" style="--orb:{a}"></div>
  <div class="bg-orb orb-2" style="--orb:{a2}"></div>
  <div class="bg-orb orb-3" style="--orb:{a3}"></div>
  <div class="bg-noise"></div>
  <canvas class="slide-particles"></canvas>
  <div class="cover-content">
    <div class="cover-badge" style="--badge-c:{a}">
      <span class="badge-dot"></span>
      <span>AI-POWERED PRESENTATION</span>
    </div>
    <h1 class="cover-title">{title}</h1>
    <div class="cover-line" style="--line-c:linear-gradient(90deg,{a},{a2},{a3})"></div>
    <div class="cover-meta">
      <span class="meta-item"><kbd>→</kbd> Next slide</span>
      <span class="meta-item"><kbd>F</kbd> Fullscreen</span>
      <span class="meta-item"><kbd>N</kbd> Speaker notes</span>
    </div>
  </div>
  <div class="slide-number">{num}</div>
  <div class="notes" data-n="{notes}">{s.get("speaker_notes", "")}</div>
</section>
'''), ""


def _slide_content(s: dict, i: int, tot: int, t: dict, img: any, caption: str = "") -> tuple:
    title      = _esc(s.get("title", ""))
    paragraph  = _esc(s.get("paragraph", ""))
    key_points = s.get("key_points", [])
    page_range = _esc(s.get("page_range", ""))
    # fallback: if no paragraph, join bullets into one
    if not paragraph:
        bullets = s.get("bullets", [])
        paragraph = _esc(" ".join(
            (b.get("text","") if isinstance(b,dict) else str(b)) for b in bullets
        ))
    notes  = _esc(s.get("speaker_notes", ""))
    num    = f"{i + 1}/{tot}"
    a, a2, a3 = t["a"], t["a2"], t["a3"]
    r, g, b = _rgb(a)

    # Key points HTML
    kp_html = ""
    if key_points:
        items = ""
        for kp in key_points[:3]:
            text = _esc(kp.get("text","") if isinstance(kp,dict) else str(kp))
            src  = _esc(kp.get("source_id","") if isinstance(kp,dict) else "")
            src_tag = f'<span class="kp-src">📄 {src}</span>' if src else ''
            items += f'<li class="kp-item"><span class="kp-dot" style="background:{a}"></span><span class="kp-text">{text}</span>{src_tag}</li>'
        kp_html = f'<ul class="key-points">{items}</ul>'

    # Page range badge
    page_badge = f'<div class="page-badge">📄 {page_range}</div>' if page_range else ''

    # Image HTML — support single image or list of two images
    img_html = ""
    if img:
        img_list = img if isinstance(img, list) else [img]
        cards = []
        for img_item in img_list[:2]:
            src = img_item.get("url") if isinstance(img_item, dict) else img_item
            if not src:
                continue
            safe_src = src.replace("'", "%27").replace('"', '&quot;')
            cap_esc  = _esc(caption)
            src_info = ""
            if caption:
                m = re.search(r'(Figure|Fig\.?|Table|Chart)\s*[\d\-\.]+', caption, re.IGNORECASE)
                if m:
                    src_info = m.group(0)
            cards.append(f'''
            <div class="media-card image-card" onclick="openLightbox('{safe_src}','{cap_esc}','{_esc(src_info)}')">
              <img src="{safe_src}" alt="Slide visual" class="card-image"/>
              <div class="image-overlay">
                <span class="zoom-icon">🔍</span>
                <span>Click to enlarge</span>
              </div>
              {f'<div class="image-caption">{cap_esc}</div>' if caption else ''}
            </div>''')
        if len(cards) == 2:
            img_html = f'<div class="dual-images">{"".join(cards)}</div>'
        elif cards:
            img_html = cards[0]

    layout_class = "layout-split" if img_html else "layout-full"
    media_col    = f'<div class="media-column">{img_html}</div>' if img_html else ""

    return (f'''
<section class="slide s-content" data-idx="{i}" style="--a:{a};--a2:{a2};--a3:{a3}">
  <div class="bg-gradient subtle"></div>
  <div class="bg-orb orb-mini" style="--orb:{a}"></div>
  <div class="bg-noise"></div>
  <canvas class="slide-particles"></canvas>
  <div class="accent-bar" style="--bar:linear-gradient(90deg,{a},{a2},{a3})"></div>
  <div class="slide-inner">
    <header class="slide-header">
      <div class="slide-badge" style="--badge-c:{a}">SLIDE {i + 1:02d}</div>
      <h2 class="slide-title">{title}</h2>
      <div class="title-underline" style="--line-c:{a}"></div>
    </header>
    <div class="slide-body {layout_class}">
      <div class="text-column">
        <p class="slide-paragraph">{paragraph}</p>
        {kp_html}
        {page_badge}
      </div>
      {media_col}
    </div>
  </div>
  <div class="slide-number">{num}</div>
  <div class="notes" data-n="{notes}">{s.get("speaker_notes", "")}</div>
</section>
'''), ""


def _slide_intro(s: dict, i: int, tot: int, t: dict, img: any, caption: str = "") -> tuple:
    title     = _esc(s.get("title", ""))
    paragraph = _esc(s.get("paragraph", ""))
    key_points = s.get("key_points", [])
    page_range = _esc(s.get("page_range", ""))
    if not paragraph:
        bullets = s.get("bullets", [])
        paragraph = _esc(" ".join(
            (b.get("text","") if isinstance(b,dict) else str(b)) for b in bullets
        ))
    notes = _esc(s.get("speaker_notes", ""))
    num   = f"{i + 1}/{tot}"
    a, a2, a3 = t["a"], t["a2"], t["a3"]

    kp_html = ""
    if key_points:
        items = "".join(
            f'<div class="intro-point" style="--delay:{0.35+j*0.08:.2f}s">'
            f'<span class="point-marker" style="--marker-c:{a2 if j%2 else a}"></span>'
            f'<span class="point-text">{_esc(kp.get("text","") if isinstance(kp,dict) else str(kp))}</span>'
            f'</div>'
            for j, kp in enumerate(key_points)
        )
        kp_html = f'<div class="intro-points">{items}</div>'

    page_badge = f'<div class="page-badge" style="margin-top:16px">📄 {page_range}</div>' if page_range else ''

    return (f'''
<section class="slide s-intro" data-idx="{i}" style="--a:{a};--a2:{a2};--a3:{a3}">
  <div class="bg-gradient"></div>
  <div class="bg-orb orb-center" style="--orb:{a}"></div>
  <div class="bg-noise"></div>
  <canvas class="slide-particles"></canvas>
  <div class="intro-content">
    <div class="slide-badge centered" style="--badge-c:{a}">INTRODUCTION</div>
    <h2 class="intro-title">{title}</h2>
    <div class="intro-line" style="--line-c:linear-gradient(90deg,transparent,{a},{a2},transparent)"></div>
    <p class="intro-para">{paragraph}</p>
    {kp_html}
    {page_badge}
  </div>
  <div class="slide-number">{num}</div>
  <div class="notes" data-n="{notes}">{s.get("speaker_notes", "")}</div>
</section>
'''), ""


def _slide_comparison(s: dict, i: int, tot: int, t: dict, img: any, caption: str = "") -> tuple:
    title = _esc(s.get("title", ""))
    bullets = s.get("bullets", [])
    notes = _esc(s.get("speaker_notes", ""))
    num = f"{i + 1}/{tot}"
    a, a2, a3 = t["a"], t["a2"], t["a3"]
    r, g, b = _rgb(a)
    r2, g2, b2 = _rgb(a2)

    mid = max(1, len(bullets) // 2)
    left_pts = bullets[:mid]
    right_pts = bullets[mid:]

    def col(pts, accent, label, ra, ga, ba, base_delay):
        items = "".join(
            f'''<li class="cmp-item" style="--delay:{base_delay + j * 0.06:.2f}s">
              <span class="cmp-marker" style="--c:{accent}"></span>
              <span>{_esc(p.get("text", "") if isinstance(p, dict) else str(p))}</span>
            </li>'''
            for j, p in enumerate(pts)
        )
        return f'''
        <div class="cmp-column" style="--col-c:{accent};--col-rgb:{ra},{ga},{ba}">
          <div class="cmp-header">{label}</div>
          <ul class="cmp-list">{items}</ul>
        </div>
        '''

    return (f'''
<section class="slide s-comparison" data-idx="{i}" style="--a:{a};--a2:{a2};--a3:{a3}">
  <div class="bg-gradient subtle"></div>
  <div class="bg-noise"></div>
  <div class="accent-bar" style="--bar:linear-gradient(90deg,{a},{a2},{a3})"></div>
  <div class="slide-inner">
    <header class="slide-header">
      <div class="slide-badge" style="--badge-c:{a}">COMPARISON</div>
      <h2 class="slide-title">{title}</h2>
      <div class="title-underline" style="--line-c:{a}"></div>
    </header>
    <div class="cmp-grid">
      {col(left_pts, a, "Option A", r, g, b, 0.15)}
      <div class="cmp-divider">
        <div class="vs-badge" style="--vs-bg:linear-gradient(135deg,{a},{a2})">VS</div>
      </div>
      {col(right_pts, a2, "Option B", r2, g2, b2, 0.30)}
    </div>
  </div>
  <div class="slide-number">{num}</div>
  <div class="notes" data-n="{notes}">{s.get("speaker_notes", "")}</div>
</section>
'''), ""


def _slide_outro(s: dict, i: int, tot: int, t: dict, img: any, topic: str) -> tuple:
    title     = _esc(s.get("title", "Conclusion"))
    paragraph = _esc(s.get("paragraph", ""))
    key_points = s.get("key_points", [])
    page_range = _esc(s.get("page_range", ""))
    notes     = _esc(s.get("speaker_notes", ""))
    num       = f"{i + 1}/{tot}"
    a, a2, a3 = t["a"], t["a2"], t["a3"]

    # fallback: use bullets if no paragraph
    if not paragraph:
        bullets = s.get("bullets", [])
        paragraph = _esc(" ".join(
            (b.get("text","") if isinstance(b,dict) else str(b)) for b in bullets
        ))

    kp_html = ""
    if key_points:
        points = "".join(
            f'''<div class="outro-point" style="--delay:{0.35 + j * 0.08:.2f}s">
              <span class="outro-marker" style="--c:{a2 if j % 2 else a}"></span>
              <span>{_esc(kp.get("text","") if isinstance(kp,dict) else str(kp))}</span>
            </div>'''
            for j, kp in enumerate(key_points[:5])
        )
        kp_html = f'<div class="outro-points">{points}</div>'

    page_badge = f'<div class="page-badge" style="margin-top:16px">📄 {page_range}</div>' if page_range else ''

    return (f'''
<section class="slide s-outro" data-idx="{i}" style="--a:{a};--a2:{a2};--a3:{a3}">
  <div class="bg-gradient"></div>
  <div class="bg-orb orb-1" style="--orb:{a}"></div>
  <div class="bg-orb orb-2" style="--orb:{a2}"></div>
  <div class="bg-noise"></div>
  <canvas class="slide-particles"></canvas>
  <div class="outro-content">
    <div class="outro-icon" style="--icon-c:{a}">✦</div>
    <h2 class="outro-title" style="--title-grad:linear-gradient(135deg,{a},{a2})">{title}</h2>
    <div class="outro-line" style="--line-c:linear-gradient(90deg,{a},{a2},{a3})"></div>
    <p class="outro-para">{paragraph}</p>
    {kp_html}
    {page_badge}
    <div class="outro-topic" style="--topic-c:{a2}">{_esc(topic)}</div>
  </div>
  <div class="slide-number">{num}</div>
  <div class="notes" data-n="{notes}">{s.get("speaker_notes", "")}</div>
</section>
'''), ""


def _slide_stats(s: dict, i: int, tot: int, t: dict, img: any, caption: str = "") -> tuple:
    # For simplicity, treat stats like content slides
    return _slide_content(s, i, tot, t, img, caption)


# ── CSS ───────────────────────────────────────────────────────────────────────

def _css(t: dict) -> str:
    bg, bg2 = t["bg"], t["bg2"]
    ink, muted = t["ink"], t["muted"]
    a, a2, a3 = t["a"], t["a2"], t["a3"]
    card = t["card"]
    r, g, b = _rgb(a)
    is_dark = t["dark"]
    blend = "screen" if is_dark else "multiply"
    
    return f'''
/* ═══════════════════════════════════════════════════════════════════════════
   GAMMA-STYLE PRESENTATION — CSS
   ═══════════════════════════════════════════════════════════════════════════ */

*, *::before, *::after {{ box-sizing: border-box; margin: 0; padding: 0; }}

:root {{
  --bg: {bg};
  --bg2: {bg2};
  --ink: {ink};
  --muted: {muted};
  --a: {a};
  --a2: {a2};
  --a3: {a3};
  --card: {card};
  --radius: 16px;
  --radius-sm: 10px;
  --shadow: 0 25px 50px -12px rgba(0,0,0,0.5);
  --shadow-sm: 0 10px 25px -5px rgba(0,0,0,0.3);
}}

html, body {{
  width: 100%; height: 100%;
  overflow: hidden;
  background: var(--bg);
  color: var(--ink);
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  -webkit-font-smoothing: antialiased;
  cursor: none;
}}

/* ── Custom Cursor ── */
#cursor {{
  position: fixed;
  width: 8px; height: 8px;
  background: {a};
  border-radius: 50%;
  pointer-events: none;
  z-index: 10000;
  transform: translate(-50%, -50%);
  mix-blend-mode: {blend};
  transition: transform 0.1s ease;
}}
#cursor-ring {{
  position: fixed;
  width: 32px; height: 32px;
  border: 1.5px solid {a};
  border-radius: 50%;
  pointer-events: none;
  z-index: 9999;
  transform: translate(-50%, -50%);
  opacity: 0.3;
  transition: left 0.08s ease, top 0.08s ease;
}}

/* ── Deck Container ── */
#deck {{ position: fixed; inset: 0; }}

/* ── Base Slide ── */
.slide {{
  position: absolute;
  inset: 0;
  background: var(--bg);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  opacity: 0;
  pointer-events: none;
  transform: translateX(80px) scale(0.96);
  transition: none;
}}
.slide.active {{
  opacity: 1;
  pointer-events: all;
  transform: none;
  transition: transform 0.6s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.35s ease;
}}
.slide.xl {{ transform: translateX(-80px) scale(0.96); opacity: 0; }}
.slide.xr {{ transform: translateX(80px) scale(0.96); opacity: 0; }}

/* ── Background Effects ── */
.bg-gradient {{
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse 80% 60% at 50% -20%, rgba({r},{g},{b},0.15), transparent 60%),
              radial-gradient(ellipse 60% 50% at 100% 100%, rgba({r},{g},{b},0.08), transparent 50%);
  z-index: 0;
}}
.bg-gradient.subtle {{
  background: radial-gradient(ellipse 70% 50% at 20% 0%, rgba({r},{g},{b},0.08), transparent 50%);
}}

.bg-orb {{
  position: absolute;
  border-radius: 50%;
  filter: blur(100px);
  opacity: 0.5;
  z-index: 0;
  animation: orb-float 20s ease-in-out infinite;
}}
.orb-1 {{ width: 50vw; height: 50vw; top: -20%; left: -10%; background: var(--orb); }}
.orb-2 {{ width: 40vw; height: 40vw; bottom: -15%; right: -5%; background: var(--orb); animation-delay: -7s; }}
.orb-3 {{ width: 30vw; height: 30vw; top: 40%; right: 20%; background: var(--orb); animation-delay: -14s; opacity: 0.3; }}
.orb-center {{ width: 45vw; height: 45vw; top: 50%; left: 50%; transform: translate(-50%, -50%); background: var(--orb); }}
.orb-mini {{ width: 30vw; height: 30vw; top: -10%; right: -5%; background: var(--orb); opacity: 0.3; }}

@keyframes orb-float {{
  0%, 100% {{ transform: translate(0, 0) scale(1); }}
  33% {{ transform: translate(3%, 5%) scale(1.05); }}
  66% {{ transform: translate(-2%, 2%) scale(0.97); }}
}}

.bg-noise {{
  position: absolute;
  inset: 0;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  opacity: 0.03;
  z-index: 1;
  pointer-events: none;
}}

/* ── Floating Particles Canvas ── */
.slide-particles {{
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
  opacity: 0.45;
}}

/* ── Accent Bar ── */
.accent-bar {{
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: var(--bar);
  z-index: 10;
}}

/* ── Slide Inner ── */
.slide-inner{{position:relative;z-index:5;display:flex;flex-direction:column;width:100%;height:100%;padding:40px 56px 36px;gap:0}}


/* ── Slide Header ── */
.slide-header {{
  flex-shrink: 0;
  margin-bottom: 32px;
}}

.slide-badge {{
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--badge-c);
  background: rgba({r},{g},{b},0.1);
  border: 1px solid rgba({r},{g},{b},0.2);
  padding: 6px 14px;
  border-radius: 100px;
  margin-bottom: 16px;
  opacity: 0;
  animation: fade-up 0.5s ease 0.1s forwards;
}}
.slide-badge.centered {{ margin: 0 auto 20px; }}

.slide-title {{
  font-family: 'Plus Jakarta Sans', 'Inter', sans-serif;
  font-size: clamp(32px, 4vw, 56px);
  font-weight: 800;
  letter-spacing: -1.5px;
  line-height: 1.1;
  color: var(--ink);
  margin-bottom: 16px;
  opacity: 0;
  animation: fade-up 0.6s ease 0.15s forwards;
}}

.title-underline {{
  width: 64px;
  height: 3px;
  background: var(--line-c);
  border-radius: 3px;
  opacity: 0;
  animation: fade-up 0.5s ease 0.2s forwards;
}}

@keyframes fade-up {{
  from {{ opacity: 0; transform: translateY(20px); }}
  to {{ opacity: 1; transform: none; }}
}}

/* ── Slide Body Layouts ── */
.slide-body {{
  flex: 1;
  display: flex;
  min-height: 0;
}}

.layout-full {{ flex-direction: column; }}
.layout-split {{ gap: 40px; }}

.text-column {{
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-width: 0;
}}

.media-column {{
  flex: 0 0 45%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-width: 0;
}}
.media-column.stacked {{ gap: 16px; }}

/* ── Paragraph + Key Points Layout ── */
.slide-paragraph{{font-size:16px;font-weight:400;line-height:1.75;color:{ink};opacity:0;animation:fade-up .6s ease .15s forwards;margin-bottom:20px}}

.key-points{{list-style:none;display:flex;flex-direction:column;gap:8px;margin-bottom:14px}}
.kp-item{{display:flex;align-items:flex-start;gap:10px;opacity:0;animation:fade-up .5s ease both var(--delay,0.3s)}}
.kp-dot{{width:7px;height:7px;border-radius:50%;flex-shrink:0;margin-top:7px}}
.kp-text{{font-size:13.5px;font-weight:500;color:{muted};line-height:1.5;flex:1}}
.kp-src{{font-size:10px;color:{a};font-weight:500;margin-left:6px;opacity:.8;flex-shrink:0}}

.page-badge{{display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:600;color:{a};background:rgba({r},{g},{b},.1);padding:4px 12px;border-radius:20px;border:1px solid rgba({r},{g},{b},.2);opacity:0;animation:fade-up .5s ease .5s forwards}}

/* ── Media Cards ── */
.media-card {{
  background: {card};
  backdrop-filter: blur(20px);
  border: 1px solid rgba({r},{g},{b},0.15);
  border-radius: var(--radius);
  overflow: hidden;
  box-shadow: var(--shadow);
  opacity: 0;
  animation: fade-up 0.6s ease 0.3s forwards;
}}

.image-card {{
  cursor: pointer;
  position: relative;
  transition: transform 0.3s ease, box-shadow 0.3s ease;
}}
.image-card:hover {{
  transform: scale(1.02);
  box-shadow: 0 30px 60px -15px rgba(0,0,0,0.6);
}}
.image-card:hover .image-overlay {{
  opacity: 1;
}}
.dual-images {{
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  height: 100%;
}}

.card-image {{
  width: 100%;
  height: auto;
  max-height: 380px;
  object-fit: contain;
  display: block;
}}

.image-overlay {{
  position: absolute;
  inset: 0;
  background: rgba(0,0,0,0.5);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: white;
  font-size: 13px;
  font-weight: 500;
  opacity: 0;
  transition: opacity 0.2s ease;
  backdrop-filter: blur(4px);
}}
.zoom-icon {{
  font-size: 28px;
}}

.image-caption {{
  padding: 14px 18px;
  font-size: 13px;
  font-weight: 500;
  color: var(--ink);
  background: rgba({r},{g},{b},0.06);
  border-top: 1px solid rgba({r},{g},{b},0.1);
  line-height: 1.5;
}}

.diagram-card {{
  padding: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 200px;
}}
.diagram-card .mermaid {{
  width: 100%;
  color: var(--ink) !important;
  background: transparent !important;
}}
.diagram-card .mermaid svg {{
  width: 100% !important;
  max-width: 100%;
  height: auto !important;
  display: block;
  filter: drop-shadow(0 8px 16px rgba(0,0,0,0.3));
}}

/* ── Cover Slide ── */
.cover-content {{
  position: relative;
  z-index: 5;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  height: 100%;
  padding: 60px;
}}

.cover-badge {{
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.14em;
  color: var(--badge-c);
  background: rgba({r},{g},{b},0.1);
  border: 1px solid rgba({r},{g},{b},0.25);
  padding: 8px 20px;
  border-radius: 100px;
  margin-bottom: 36px;
  opacity: 0;
  animation: fade-up 0.6s ease 0.1s forwards;
}}
.badge-dot {{
  width: 6px;
  height: 6px;
  background: var(--badge-c);
  border-radius: 50%;
  animation: pulse 2s ease-in-out infinite;
}}
@keyframes pulse {{
  0%, 100% {{ opacity: 1; transform: scale(1); }}
  50% {{ opacity: 0.5; transform: scale(1.2); }}
}}

.cover-title {{
  font-family: 'Plus Jakarta Sans', sans-serif;
  font-size: clamp(44px, 7vw, 96px);
  font-weight: 800;
  letter-spacing: -3px;
  line-height: 1.05;
  color: var(--ink);
  max-width: 1000px;
  margin-bottom: 36px;
  opacity: 0;
  animation: fade-up 0.7s ease 0.2s forwards;
}}

.cover-line {{
  width: 120px;
  height: 4px;
  background: var(--line-c);
  border-radius: 4px;
  margin-bottom: 40px;
  opacity: 0;
  animation: fade-up 0.6s ease 0.35s forwards;
}}

.cover-meta {{
  display: flex;
  gap: 24px;
  flex-wrap: wrap;
  justify-content: center;
  opacity: 0;
  animation: fade-up 0.6s ease 0.5s forwards;
}}
.meta-item {{
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--muted);
}}
.meta-item kbd {{
  background: rgba({r},{g},{b},0.12);
  border: 1px solid rgba({r},{g},{b},0.2);
  padding: 4px 10px;
  border-radius: 6px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  color: var(--ink);
}}

/* ── Table of Contents ── */
.toc-table {{
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow-y: auto;
  padding-right: 4px;
}}
.toc-row {{
  display: flex;
  align-items: center;
  gap: 18px;
  padding: 16px 22px;
  border-radius: 14px;
  background: rgba({r},{g},{b},.05);
  border: 1px solid rgba({r},{g},{b},.12);
  opacity: 0;
  animation: fade-up .4s ease both var(--delay);
  cursor: pointer;
  transition: background .18s, transform .18s, border-color .18s;
}}
.toc-row:hover {{
  background: rgba({r},{g},{b},.12);
  border-color: rgba({r},{g},{b},.3);
  transform: translateX(6px);
}}
.toc-num-box {{
  width: 40px;
  height: 40px;
  border-radius: 10px;
  border: 1px solid;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 700;
  font-family: 'JetBrains Mono', monospace;
  flex-shrink: 0;
}}
.toc-row-label {{
  font-size: 18px;
  font-weight: 600;
  color: {ink};
  flex: 1;
  line-height: 1.3;
}}
.toc-type-badge {{
  font-size: 11px;
  font-weight: 700;
  letter-spacing: .08em;
  padding: 4px 12px;
  border-radius: 20px;
  flex-shrink: 0;
  text-transform: uppercase;
}}
.toc-arrow {{
  font-size: 22px;
  font-weight: 300;
  flex-shrink: 0;
  opacity: 0.5;
  transition: opacity .18s, transform .18s;
}}
.toc-row:hover .toc-arrow {{
  opacity: 1;
  transform: translateX(4px);
}}

/* ── Intro Slide ── */
.intro-content {{
  position: relative;
  z-index: 5;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  height: 100%;
  padding: 60px;
}}

.intro-title {{
  font-family: 'Plus Jakarta Sans', sans-serif;
  font-size: clamp(36px, 5vw, 68px);
  font-weight: 800;
  letter-spacing: -2px;
  line-height: 1.1;
  color: var(--ink);
  margin-bottom: 24px;
}}

.intro-line {{
  width: 100px;
  height: 2px;
  background: var(--line-c);
  border-radius: 2px;
  margin-bottom: 24px;
}}

.intro-para {{
  font-size: 17px;
  line-height: 1.75;
  color: var(--muted);
  max-width: 680px;
  text-align: left;
  opacity: 0;
  animation: fade-up 0.6s ease 0.3s forwards;
  margin-bottom: 20px;
}}

.intro-points {{
  display: flex;
  flex-direction: column;
  gap: 10px;
  text-align: left;
  max-width: 700px;
}}

.intro-point {{
  display: flex;
  align-items: flex-start;
  gap: 14px;
  opacity: 0;
  animation: fade-up 0.5s ease var(--delay) forwards;
}}
.point-marker {{
  width: 8px;
  height: 8px;
  background: var(--marker-c);
  border-radius: 50%;
  flex-shrink: 0;
  margin-top: 8px;
}}
.point-text {{
  font-size: 20px;
  line-height: 1.7;
  color: var(--muted);
}}

/* ── Comparison Slide ── */
.cmp-grid {{
  flex: 1;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  gap: 24px;
  align-items: start;
}}

.cmp-column {{
  background: {card};
  backdrop-filter: blur(20px);
  border: 1px solid rgba(var(--col-rgb),0.15);
  border-top: 3px solid var(--col-c);
  border-radius: var(--radius);
  overflow: hidden;
}}

.cmp-header {{
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--col-c);
  padding: 14px 20px;
  background: rgba(var(--col-rgb),0.08);
}}

.cmp-list {{
  list-style: none;
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}}

.cmp-item {{
  display: flex;
  align-items: flex-start;
  gap: 12px;
  font-size: 17px;
  line-height: 1.6;
  color: var(--muted);
  opacity: 0;
  animation: fade-up 0.5s ease var(--delay) forwards;
}}
.cmp-marker {{
  width: 6px;
  height: 6px;
  background: var(--c);
  border-radius: 50%;
  flex-shrink: 0;
  margin-top: 7px;
}}

.cmp-divider {{
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 8px;
}}
.vs-badge {{
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--vs-bg);
  color: white;
  font-size: 12px;
  font-weight: 800;
  border-radius: 50%;
  box-shadow: 0 10px 30px rgba(0,0,0,0.4);
}}

/* ── Outro Slide ── */
.outro-content {{
  position: relative;
  z-index: 5;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  height: 100%;
  padding: 60px;
}}

.outro-icon {{
  width: 80px;
  height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 32px;
  color: var(--icon-c);
  border: 2px solid var(--icon-c);
  border-radius: 50%;
  margin-bottom: 32px;
  opacity: 0;
  animation: fade-up 0.6s ease 0.1s forwards, float 4s ease-in-out 0.6s infinite;
}}
@keyframes float {{
  0%, 100% {{ transform: translateY(0); }}
  50% {{ transform: translateY(-10px); }}
}}

.outro-title {{
  font-family: 'Plus Jakarta Sans', sans-serif;
  font-size: clamp(40px, 6vw, 80px);
  font-weight: 800;
  letter-spacing: -2px;
  line-height: 1.1;
  background: var(--title-grad);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  margin-bottom: 20px;
  opacity: 0;
  animation: fade-up 0.6s ease 0.2s forwards;
}}

.outro-line {{
  width: 100px;
  height: 3px;
  background: var(--line-c);
  border-radius: 3px;
  margin-bottom: 36px;
  opacity: 0;
  animation: fade-up 0.5s ease 0.3s forwards;
}}

.outro-points {{
  display: flex;
  flex-direction: column;
  gap: 12px;
  text-align: left;
  max-width: 600px;
  margin-bottom: 32px;
}}

.outro-point {{
  display: flex;
  align-items: flex-start;
  gap: 12px;
  font-size: 16px;
  line-height: 1.6;
  color: var(--muted);
  opacity: 0;
  animation: fade-up 0.5s ease var(--delay) forwards;
}}
.outro-marker {{
  width: 8px;
  height: 8px;
  background: var(--c);
  border-radius: 50%;
  flex-shrink: 0;
  margin-top: 7px;
}}

.outro-topic {{
  font-size: 14px;
  color: var(--topic-c);
  opacity: 0.7;
  opacity: 0;
  animation: fade-up 0.5s ease 0.7s forwards;
}}

.outro-para {{
  font-size: 16px;
  line-height: 1.75;
  color: var(--muted);
  max-width: 640px;
  text-align: left;
  opacity: 0;
  animation: fade-up 0.6s ease 0.3s forwards;
  margin-bottom: 20px;
}}

/* ── HUD ── */
#hud {{
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 500;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 24px;
  pointer-events: none;
  background: linear-gradient(to bottom, rgba({r},{g},{b},0.06), transparent);
}}

#hud-title {{
  font-size: 12px;
  font-weight: 600;
  color: var(--muted);
  opacity: 0.6;
  max-width: 40%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}}

.hud-buttons {{
  display: flex;
  gap: 8px;
  pointer-events: all;
}}

.hud-btn {{
  background: rgba({r},{g},{b},0.1);
  border: 1px solid rgba({r},{g},{b},0.18);
  padding: 7px 16px;
  border-radius: 8px;
  color: var(--ink);
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
  backdrop-filter: blur(12px);
}}
.hud-btn:hover {{
  background: rgba({r},{g},{b},0.2);
  border-color: rgba({r},{g},{b},0.3);
}}
.hud-btn.active {{
  background: {a};
  border-color: {a};
  color: white;
}}

/* ── Progress Bar ── */
#progress {{
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: 3px;
  z-index: 500;
  background: rgba({r},{g},{b},0.1);
}}
#progress-fill {{
  height: 100%;
  background: linear-gradient(90deg, {a}, {a2});
  transition: width 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}}

/* ── Nav Arrows ── */
.nav-arrow {{
  position: fixed;
  top: 50%;
  transform: translateY(-50%);
  z-index: 500;
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba({r},{g},{b},0.08);
  border: 1px solid rgba({r},{g},{b},0.12);
  border-radius: 50%;
  color: var(--muted);
  font-size: 24px;
  cursor: pointer;
  transition: all 0.2s ease;
}}
.nav-arrow:hover {{
  background: rgba({r},{g},{b},0.2);
  color: var(--ink);
  transform: translateY(-50%) scale(1.05);
}}
#nav-prev {{ left: 16px; }}
#nav-next {{ right: 16px; }}

/* ── Slide Number ── */
.slide-number {{
  position: absolute;
  bottom: 20px;
  left: 28px;
  font-size: 13px;
  font-weight: 600;
  font-family: 'JetBrains Mono', monospace;
  color: var(--ink);
  opacity: 0.5;
  z-index: 10;
  background: rgba({r},{g},{b},0.1);
  padding: 5px 12px;
  border-radius: 6px;
  border: 1px solid rgba({r},{g},{b},0.12);
}}

/* ── Notes Panel ── */
.notes {{
  display: none;
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: rgba({r},{g},{b},0.95);
  backdrop-filter: blur(24px);
  padding: 24px 60px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 13px;
  line-height: 1.7;
  color: var(--ink);
  z-index: 600;
  border-top: 1px solid rgba({r},{g},{b},0.2);
  max-height: 30vh;
  overflow-y: auto;
}}
.notes-on .notes {{ display: block; }}

/* ── Lightbox ── */
#lightbox {{
  display: none;
  position: fixed;
  inset: 0;
  z-index: 9000;
  background: rgba(0, 0, 0, 0.95);
  align-items: center;
  justify-content: center;
  cursor: zoom-out;
  backdrop-filter: blur(16px);
}}
#lightbox.open {{ display: flex; }}

#lb-container {{
  display: flex;
  flex-direction: column;
  align-items: center;
  cursor: default;
  max-width: 92vw;
}}

#lb-image {{
  max-width: 90vw;
  max-height: 75vh;
  object-fit: contain;
  border-radius: 12px 12px 0 0;
  box-shadow: 0 50px 100px rgba(0, 0, 0, 0.8);
  animation: lb-zoom 0.25s ease;
}}
@keyframes lb-zoom {{
  from {{ opacity: 0; transform: scale(0.9); }}
  to {{ opacity: 1; transform: scale(1); }}
}}

#lb-meta {{
  width: 100%;
  background: rgba(15, 15, 20, 0.95);
  border-radius: 0 0 12px 12px;
  padding: 16px 24px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-top: none;
}}

#lb-caption {{
  font-size: 15px;
  font-weight: 500;
  color: #f4f4f8;
  line-height: 1.5;
  margin-bottom: 6px;
}}
#lb-source {{
  font-size: 12px;
  color: {a};
  font-weight: 500;
}}
#lb-caption:empty, #lb-source:empty {{ display: none; }}

#lb-close {{
  position: absolute;
  top: 20px;
  right: 28px;
  color: white;
  font-size: 36px;
  cursor: pointer;
  opacity: 0.5;
  transition: opacity 0.15s ease;
  line-height: 1;
}}
#lb-close:hover {{ opacity: 1; }}
'''


# ── JavaScript ────────────────────────────────────────────────────────────────

_JS = r'''
(function() {
  // Custom cursor
  const cursor = document.getElementById('cursor');
  const cursorRing = document.getElementById('cursor-ring');
  
  document.addEventListener('mousemove', e => {
    cursor.style.left = e.clientX + 'px';
    cursor.style.top = e.clientY + 'px';
    cursorRing.style.left = e.clientX + 'px';
    cursorRing.style.top = e.clientY + 'px';
  });

  // Mermaid init

  // Slides
  const slides = Array.from(document.querySelectorAll('.slide'));
  let current = 0;
  let notesOn = false;

  function goTo(n, forward = true) {
    if (n < 0 || n >= slides.length) return;
    
    slides[current].classList.remove('active');
    slides[current].classList.add(forward ? 'xl' : 'xr');
    
    slides[n].classList.remove('xl', 'xr');
    slides[n].classList.add('active');
    
    current = n;
    update();
  }

  function next() { goTo(current + 1, true); }
  function prev() { goTo(current - 1, false); }

  function update() {
    const pct = (current / (slides.length - 1)) * 100;
    document.getElementById('progress-fill').style.width = pct + '%';
    slides.forEach((s, i) => s.classList.toggle('notes-on', notesOn && i === current));
  }

  function toggleNotes() {
    notesOn = !notesOn;
    update();
    document.getElementById('btn-notes').classList.toggle('active', notesOn);
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  }

  // Lightbox
  window.openLightbox = function(src, caption, source) {
    document.getElementById('lb-image').src = src;
    document.getElementById('lb-caption').textContent = caption || '';
    document.getElementById('lb-source').textContent = source || '';
    document.getElementById('lightbox').classList.add('open');
  };

  window.closeLightbox = function() {
    document.getElementById('lightbox').classList.remove('open');
    document.getElementById('lb-image').src = '';
  };

  // Keyboard
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeLightbox(); return; }
    if (e.key === 'ArrowRight' || e.key === ' ') next();
    if (e.key === 'ArrowLeft') prev();
    if (e.key === 'n' || e.key === 'N') toggleNotes();
    if (e.key === 'f' || e.key === 'F') toggleFullscreen();
  });

  // Navigation buttons
  document.getElementById('nav-prev').addEventListener('click', prev);
  document.getElementById('nav-next').addEventListener('click', next);
  document.getElementById('btn-notes').addEventListener('click', toggleNotes);
  document.getElementById('btn-fs').addEventListener('click', toggleFullscreen);

  // Init
  slides[0].classList.add('active');
  update();

  // ── Floating Particles ──────────────────────────────────────────────────
  (function initParticles() {
    document.querySelectorAll('.slide-particles').forEach(canvas => {
      const slide = canvas.parentElement;
      const accentColor = slide.style.getPropertyValue('--a') || '#7c5cfc';
      const ctx = canvas.getContext('2d');
      let W = canvas.width = slide.offsetWidth || window.innerWidth;
      let H = canvas.height = slide.offsetHeight || window.innerHeight;

      // Parse accent color to RGB
      let rv = 124, gv = 92, bv = 252;
      const m = accentColor.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
      if (m) { rv = parseInt(m[1],16); gv = parseInt(m[2],16); bv = parseInt(m[3],16); }

      const pts = Array.from({length: 35}, () => ({
        x: Math.random() * W, y: Math.random() * H,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        r: Math.random() * 1.8 + 0.5,
        a: Math.random() * 0.4 + 0.1
      }));

      function draw() {
        ctx.clearRect(0, 0, W, H);
        pts.forEach(p => {
          p.x += p.vx; p.y += p.vy;
          if (p.x < 0 || p.x > W) p.vx *= -1;
          if (p.y < 0 || p.y > H) p.vy *= -1;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${rv},${gv},${bv},${p.a})`;
          ctx.fill();
        });
        requestAnimationFrame(draw);
      }
      draw();
    });
  })();

})();
'''


# ── Main Render Function ──────────────────────────────────────────────────────

def render(
    topic: str,
    slides: list,
    session_id: str,
    output_dir: str,
    images: dict = None,
    theme_name: str = None,
    captions: dict = None,
    section_outline: list = None,
) -> str:
    html_theme = _PPTX_TO_HTML_THEME.get(theme_name, theme_name)
    theme = THEMES.get(html_theme) or THEMES[_auto_theme(session_id)]

    # Build TOC entries — full slide list with numbers, types, labels
    toc_entries = []
    if section_outline:
        # Slide 1 = cover (skip), Slide 2 = TOC (skip), Slide 3 = intro
        # Then content slides, last = summary
        slide_num = 3  # intro starts at 3 (after cover + TOC)
        toc_entries.append({"num": slide_num, "label": "Introduction", "type": "intro"})
        slide_num += 1

        seen_toc = set()
        for entry in section_outline:
            label = entry.get('section', entry) if isinstance(entry, dict) else entry
            clean = label.split(">")[-1].strip() if ">" in label else label
            toc_entries.append({"num": slide_num, "label": clean, "type": "content"})
            slide_num += 1

        toc_entries.append({"num": slide_num, "label": "Summary", "type": "summary"})

    # Inject TOC slide after cover (index 1), shift all other slides by 1
    toc_injected = False
    total = len(slides) + (1 if toc_entries else 0)
    sections = []
    captions = captions or {}
    slide_offset = 0  # offset due to TOC injection

    for i, s in enumerate(slides):
        actual_i = i + slide_offset
        stype = s.get("slide_type") or s.get("type") or "content"
        img = (images or {}).get(i) or (images or {}).get(s.get("image_id"))
        cap = s.get("caption") or captions.get(i, "")

        # After cover (i==0), inject TOC
        if i == 0:
            h, _ = _slide_cover(s, actual_i, total, theme, img)
            sections.append(h)
            if toc_entries:
                slide_offset = 1
                actual_i = 1
                toc_h, _ = _slide_toc(toc_entries, actual_i, total, theme)
                sections.append(toc_h)
            continue

        actual_i = i + slide_offset

        if stype == "intro":
            h, _ = _slide_intro(s, actual_i, total, theme, img, cap)
        elif actual_i == total - 1:
            h, _ = _slide_outro(s, actual_i, total, theme, img, topic)
        elif stype == "comparison":
            h, _ = _slide_comparison(s, actual_i, total, theme, img, cap)
        elif stype == "stats" or s.get("chart_data"):
            h, _ = _slide_stats(s, actual_i, total, theme, img, cap)
        else:
            h, _ = _slide_content(s, actual_i, total, theme, img, cap)


        sections.append(h)

    title_esc = _esc(topic)
    
    html = f'''<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>{title_esc}</title>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@700;800&family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet"/>
  <style>{_css(theme)}</style>
</head>
<body>
  <!-- Custom Cursor -->
  <div id="cursor"></div>
  <div id="cursor-ring"></div>
  
  <!-- Lightbox -->
  <div id="lightbox" onclick="closeLightbox()">
    <span id="lb-close" onclick="closeLightbox()">&times;</span>
    <div id="lb-container" onclick="event.stopPropagation()">
      <img id="lb-image" src="" alt=""/>
      <div id="lb-meta">
        <div id="lb-caption"></div>
        <div id="lb-source"></div>
      </div>
    </div>
  </div>
  
  <!-- HUD -->
  <div id="hud">
    <div id="hud-title">{title_esc}</div>
    <div class="hud-buttons">
      <button class="hud-btn" id="btn-notes">Notes</button>
      <button class="hud-btn" id="btn-fs">Fullscreen</button>
    </div>
  </div>
  
  <!-- Progress -->
  <div id="progress"><div id="progress-fill"></div></div>
  
  <!-- Navigation -->
  <div class="nav-arrow" id="nav-prev">&#8249;</div>
  <div class="nav-arrow" id="nav-next">&#8250;</div>
  
  <!-- Slides -->
  <div id="deck">
    {"".join(sections)}
  </div>
  
  <script>{_JS}</script>
</body>
</html>'''

    os.makedirs(output_dir, exist_ok=True)
    path = os.path.join(output_dir, f"pres_{session_id[:8]}.html")
    with open(path, "w", encoding="utf-8") as f:
        f.write(html)
    return path