"""
html_renderer.py — Professional AI HTML Presentation Renderer
===========================================================
Combines RAG-powered content with high-end interactive UI/UX.
Features: Particles, Particles interaction, Charts, TTS (stub), Q&A (stub), Professional Themes.
"""

import os
import re
import json
import hashlib
import logging
from pathlib import Path

log = logging.getLogger("renderer")

# ── Themes ────────────────────────────────────────────────────────────────────
THEMES = {
    "obsidian": { "bg": "#09090f", "bg2": "#111118", "surf": "rgba(255,255,255,.05)",
                     "brd": "rgba(255,255,255,.08)", "ink": "#f0eeff", "muted": "rgba(240,238,255,.45)",
                     "a": "#7c5cfc", "a2": "#b06bff", "a3": "#4cc9f0",
                     "orb1": "#7c5cfc", "orb2": "#b06bff", "orb3": "#4cc9f0", "dark": True },
    "aurora":   { "bg": "#050e1a", "bg2": "#071524", "surf": "rgba(0,255,200,.04)",
                     "brd": "rgba(0,255,200,.10)", "ink": "#e8fff9", "muted": "rgba(232,255,249,.45)",
                     "a": "#00e5a0", "a2": "#00cfff", "a3": "#7b2fff",
                     "orb1": "#00e5a0", "orb2": "#00cfff", "orb3": "#7b2fff", "dark": True },
    "inferno":  { "bg": "#0d0600", "bg2": "#150900", "surf": "rgba(255,120,0,.05)",
                     "brd": "rgba(255,120,0,.10)", "ink": "#fff5ee", "muted": "rgba(255,245,238,.45)",
                     "a": "#ff6b00", "a2": "#ff3d6e", "a3": "#ffd600",
                     "orb1": "#ff6b00", "orb2": "#ff3d6e", "orb3": "#ffd600", "dark": True },
    "ocean":    { "bg": "#020c18", "bg2": "#041424", "surf": "rgba(56,189,248,.05)",
                     "brd": "rgba(56,189,248,.10)", "ink": "#e8f4ff", "muted": "rgba(232,244,255,.45)",
                     "a": "#38bdf8", "a2": "#818cf8", "a3": "#34d399",
                     "orb1": "#38bdf8", "orb2": "#818cf8", "orb3": "#34d399", "dark": True },
    "forest":   { "bg": "#030d05", "bg2": "#051408", "surf": "rgba(52,211,153,.05)",
                     "brd": "rgba(52,211,153,.10)", "ink": "#eeffee", "muted": "rgba(238,255,238,.45)",
                     "a": "#34d399", "a2": "#a3e635", "a3": "#fbbf24",
                     "orb1": "#34d399", "orb2": "#a3e635", "orb3": "#fbbf24", "dark": True },
    "neon":     { "bg": "#020207", "bg2": "#040410", "surf": "rgba(255,0,220,.05)",
                     "brd": "rgba(255,0,220,.10)", "ink": "#fff0ff", "muted": "rgba(255,240,255,.45)",
                     "a": "#ff00dc", "a2": "#00f5ff", "a3": "#ffff00",
                     "orb1": "#ff00dc", "orb2": "#00f5ff", "orb3": "#8b00ff", "dark": True },
    "galaxy":   { "bg": "#03000d", "bg2": "#070016", "surf": "rgba(167,139,250,.05)",
                     "brd": "rgba(167,139,250,.10)", "ink": "#f5f0ff", "muted": "rgba(245,240,255,.45)",
                     "a": "#a78bfa", "a2": "#f472b6", "a3": "#60a5fa",
                     "orb1": "#a78bfa", "orb2": "#f472b6", "orb3": "#60a5fa", "dark": True },
    "cream":    { "bg": "#f9f6f0", "bg2": "#f2ede3", "surf": "rgba(0,0,0,.04)",
                     "brd": "rgba(0,0,0,.08)", "ink": "#1a1208", "muted": "rgba(26,18,8,.50)",
                     "a": "#c2410c", "a2": "#7c3aed", "a3": "#0d9488",
                     "orb1": "#c2410c", "orb2": "#7c3aed", "orb3": "#0d9488", "dark": False },
}

# Map our PPTX theme names → HTML theme names
_PPTX_TO_HTML_THEME = {
    "Dark Navy":     "obsidian",
    "Ocean Blue":    "ocean",
    "Forest Green":  "forest",
    "Inferno":       "inferno",
    "Aurora":        "aurora",
    "Neon":          "neon",
    "Galaxy":        "galaxy",
    "Cream":         "cream",
}

_KEYS = list(THEMES.keys())

def _auto_theme(pres_id: str) -> str:
    h = int(hashlib.md5(pres_id.encode()).hexdigest()[:8], 16)
    return _KEYS[h % len(_KEYS)]

def _esc(s: str) -> str:
    return (str(s or "")).replace("&","&amp;").replace("<","&lt;").replace(">","&gt;").replace('"','&quot;').replace("'","&#39;").replace("\n"," ")

def _esc_mermaid(s: str) -> str:
    """
    Escape for Mermaid diagrams - minimal escaping to preserve syntax.
    Keeps > for arrows (-->) and prevents escaping & to avoid breaking mermaid.
    """
    if not s:
        return ""
    # Avoid escaping & and > to preserve --> and other mermaid syntax.
    return str(s).replace("<", "&lt;")

def _rgb(h: str) -> tuple:
    h = h.lstrip("#")
    if len(h) == 3: h = "".join([c*2 for c in h])
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)

def _img_style(img: str | dict | None):
    if not img: return "", ""
    src = img.get("url") if isinstance(img, dict) else img
    if not src: return "", ""
    safe = src.replace("'", "%27")
    return (
        f' style="background-image:url(\'{safe}\');background-size:cover;background-position:center"',
        '<div class="img-overlay"></div>',
    )

# ── Chart JS builder ──────────────────────────────────────────────────────────
def _chart_js(cdata: dict, cid: str, t: dict) -> str:
    labels = cdata.get("labels", [])
    values = cdata.get("values", [])
    title  = cdata.get("title", "")
    a, a2, a3 = t["a"], t["a2"], t["a3"]
    r,  g,  b  = _rgb(a)
    r2, g2, b2 = _rgb(a2)
    n = len(labels)
    is_dark = t["dark"]

    fills   = json.dumps([
        f"rgba({int(r+(r2-r)*i/max(n-1,1))},{int(g+(g2-g)*i/max(n-1,1))},{int(b+(b2-b)*i/max(n-1,1))},0.85)"
        for i in range(n)
    ])
    borders = json.dumps([a] * n)
    tick_c  = "rgba(240,238,255,.5)" if is_dark else "rgba(26,18,8,.5)"
    grid_c  = f"rgba({r},{g},{b},.07)"
    bg_c    = "rgba(6,5,15,.95)" if is_dark else "rgba(255,255,255,.95)"
    ink_c   = t["ink"]
    cb      = "(v)=>v>=1e9?(v/1e9).toFixed(1)+'B':v>=1e6?(v/1e6).toFixed(1)+'M':v>=1e3?(v/1e3).toFixed(1)+'K':String(v)"
    tip     = (f"tooltip:{{backgroundColor:'{bg_c}',titleColor:'{ink_c}',"
               f"bodyColor:'{tick_c}',borderColor:'{a}44',borderWidth:1,"
               f"padding:14,cornerRadius:12,displayColors:false,"
               f"titleFont:{{family:'Plus Jakarta Sans',weight:'700',size:13}},"
               f"bodyFont:{{family:'DM Mono',size:11}}}}")

    lj = json.dumps(labels)
    vj = json.dumps(values)
    tl = title.lower()
    ctype = "bar"
    if any(w in tl for w in ["trend","growth","year","history","evolution"]): ctype = "line"
    elif n <= 4 or any(w in tl for w in ["share","percent","breakdown","distribution"]): ctype = "doughnut"

    base = (f"responsive:true,maintainAspectRatio:false,"
            f"plugins:{{legend:{{display:{'true' if ctype=='doughnut' else 'false'}}},{tip}}}")

    if ctype == "bar":
        return (f"(function(){{var el=document.getElementById('{cid}');if(!el)return;"
                f"new Chart(el,{{type:'bar',data:{{labels:{lj},datasets:[{{data:{vj},"
                f"backgroundColor:{fills},borderColor:{borders},borderWidth:0,"
                f"borderRadius:10,borderSkipped:false}}]}},"
                f"options:{{{base},"
                f"animation:{{duration:1200,easing:'easeOutQuart',delay:(c)=>c.dataIndex*120}},"
                f"scales:{{x:{{ticks:{{color:'{tick_c}',font:{{family:'DM Mono',size:10}}}},"
                f"grid:{{display:false}}}},y:{{beginAtZero:true,"
                f"ticks:{{color:'{tick_c}',font:{{family:'DM Mono',size:10}},callback:{cb}}},"
                f"grid:{{color:'{grid_c}'}}}}}}}})}})();")

    if ctype == "line":
        return (f"(function(){{var el=document.getElementById('{cid}');if(!el)return;"
                f"var grd=el.getContext('2d').createLinearGradient(0,0,0,280);"
                f"grd.addColorStop(0,'rgba({r},{g},{b},.35)');grd.addColorStop(1,'rgba({r},{g},{b},0)');"
                f"new Chart(el,{{type:'line',data:{{labels:{lj},datasets:[{{data:{vj},"
                f"borderColor:'{a}',backgroundColor:grd,borderWidth:3,fill:true,tension:0.45,"
                f"pointBackgroundColor:'{a}',pointBorderColor:'{a2}',pointBorderWidth:2,"
                f"pointRadius:6,pointHoverRadius:9}}]}},"
                f"options:{{{base},"
                f"animation:{{duration:1600,easing:'easeInOutQuart'}},"
                f"scales:{{x:{{ticks:{{color:'{tick_c}',font:{{family:'DM Mono',size:10}}}},"
                f"grid:{{color:'{grid_c}'}}}},"
                f"y:{{ticks:{{color:'{tick_c}',font:{{family:'DM Mono',size:10}},callback:{cb}}},"
                f"grid:{{color:'{grid_c}'}}}}}}}})}})();")

    # doughnut
    r3, g3, b3 = _rgb(a3)
    multi = json.dumps([a, a2, a3, f"rgba({r},{g},{b},.6)", f"rgba({r2},{g2},{b2},.6)", f"rgba({r3},{g3},{b3},.6)"][:n])
    return (f"(function(){{var el=document.getElementById('{cid}');if(!el)return;"
            f"new Chart(el,{{type:'doughnut',data:{{labels:{lj},datasets:[{{data:{vj},"
            f"backgroundColor:{multi},borderColor:'rgba(0,0,0,.2)',borderWidth:2,"
            f"hoverOffset:14}}]}},"
            f"options:{{{base},cutout:'68%',"
            f"animation:{{animateRotate:true,animateScale:true,duration:1400,easing:'easeOutBack'}},"
            f"plugins:{{legend:{{display:true,position:'right',"
            f"labels:{{color:'{tick_c}',font:{{family:'DM Mono',size:10}},"
            f"padding:14,boxWidth:14,boxHeight:14,usePointStyle:true,pointStyle:'circle'}}}},"
            f"{tip}}}}}}})}})();")

# ── Slide HTML builders ───────────────────────────────────────────────────────
def _particles(idx: int, accent: str) -> str:
    return f'<canvas class="pc" id="pc{idx}" data-ac="{accent}"></canvas>'

def _slide_cover(s: dict, i: int, tot: int, t: dict, img: any) -> tuple:
    title = _esc(s.get("title", ""))
    notes = _esc(s.get("speaker_notes", ""))
    num   = f"{i+1}/{tot}"
    a, a2, a3 = t["a"], t["a2"], t["a3"]
    r, g, b = _rgb(a)
    return (
        f'<section class="slide s-cover" data-idx="{i}" data-ac="{a}" style="--a:{a};--a2:{a2};--a3:{a3}">'
        f'<div class="slide-bg-orb orb1" style="background:radial-gradient(circle,{a}40,transparent 70%)"></div>'
        f'<div class="slide-bg-orb orb2" style="background:radial-gradient(circle,{a2}25,transparent 70%)"></div>'
        f'<div class="slide-bg-orb orb3" style="background:radial-gradient(circle,{a3}15,transparent 70%)"></div>'
        f'{_particles(i, a)}'
        f'<div class="cover-body">'
        f'  <div class="cover-chip" style="background:rgba({r},{g},{b},.12);border:1px solid rgba({r},{g},{b},.25);color:{a}">AI PRESENTATION</div>'
        f'  <h1 class="cover-title">{title}</h1>'
        f'  <div class="cover-bar" style="background:linear-gradient(90deg,{a},{a2},{a3})"></div>'
        f'  <div class="cover-keys">'
        f'    <span class="ck"><kbd>→</kbd> Next</span>'
        f'    <span class="ck"><kbd>←</kbd> Prev</span>'
        f'    <span class="ck"><kbd>F</kbd> Fullscreen</span>'
        f'    <span class="ck"><kbd>N</kbd> Notes</span>'
        f'  </div>'
        f'</div>'
        f'<div class="slide-num">{num}</div>'
        f'<div class="notes" data-n="{notes}">{s.get("speaker_notes","")}</div>'
        f'</section>'
    ), ""

def _slide_intro(s: dict, i: int, tot: int, t: dict, img: any, caption: str = "") -> tuple:
    title = _esc(s.get("title", ""))
    bullets = s.get("bullets", [])
    notes = _esc(s.get("speaker_notes", ""))
    num   = f"{i+1}/{tot}"
    a, a2, a3 = t["a"], t["a2"], t["a3"]
    r, g, b = _rgb(a)
    # Render bullets as a readable paragraph-style list
    bhtml = "".join(
        f'<div class="intro-point" style="--d:{0.3+j*0.1:.2f}s">'
        f'<span class="ipdot" style="background:{a2 if j%2 else a}"></span>'
        f'<span class="iptext">{_esc(b.get("text","") if isinstance(b,dict) else str(b))}</span>'
        f'</div>'
        for j, b in enumerate(bullets)
    )
    return (
        f'<section class="slide s-intro" data-idx="{i}" data-ac="{a}" style="--a:{a};--a2:{a2};--a3:{a3}">'
        f'<div class="slide-bg-orb orb1" style="background:radial-gradient(circle,{a}20,transparent 70%)"></div>'
        f'{_particles(i, a)}'
        f'<div class="slide-inner centered">'
        f'  <div class="slide-chip" style="background:rgba({r},{g},{b},.1);border-color:rgba({r},{g},{b},.2);color:{a}">INTRODUCTION</div>'
        f'  <h2 class="slide-title">{title}</h2>'
        f'  <div class="title-rule" style="background:linear-gradient(90deg,transparent,{a},{a2},transparent)"></div>'
        f'  <div class="intro-points">{bhtml}</div>'
        f'</div>'
        f'<div class="slide-num">{num}</div>'
        f'<div class="notes" data-n="{notes}">{s.get("speaker_notes","")}</div>'
        f'</section>'
    ), ""

def _slide_content(s: dict, i: int, tot: int, t: dict, img: any, caption: str = "") -> tuple:
    title   = _esc(s.get("title", ""))
    bullets = s.get("bullets", [])
    notes   = _esc(s.get("speaker_notes", ""))
    num     = f"{i+1}/{tot}"
    a, a2, a3 = t["a"], t["a2"], t["a3"]
    r, g, b = _rgb(a)

    # Build bullets — clean card style
    bhtml = ""
    for j, b in enumerate(bullets):
        bull = b.get("text", "") or b.get("content", "") if isinstance(b, dict) else str(b)
        src_info = _esc(str(b.get("source_id", ""))) if isinstance(b, dict) and b.get("source_id") else ""
        src_tag = f'<span class="src-tag">📄 {src_info}</span>' if src_info else ''
        parts = bull.split(":", 1)
        kw    = _esc(parts[0].strip())
        rest  = _esc(parts[1].strip()) if len(parts) > 1 else ""
        ac    = a2 if j % 2 else a
        ra, ga, ba = _rgb(ac)
        d = 0.1 + j * 0.08
        bhtml += (
            f'<div class="bullet-card" style="--d:{d:.2f}s;border-left:3px solid {ac}">'
            f'<div class="bc-num" style="color:{ac};background:rgba({ra},{ga},{ba},.12)">{j+1:02d}</div>'
            f'<div class="bc-body">'
            f'<span class="bc-kw" style="color:{ac}">{kw}</span>'
            + (f'<span class="bc-rest">{rest}</span>' if rest else '')
            + src_tag
            + f'</div></div>'
        )

    # Diagram
    diag_html = ""
    if s.get("diagram"):
        dv = s["diagram"]
        if dv.startswith("http"):
            diag_html = f'<div class="diag-box"><img src="{_esc(dv)}" style="max-width:100%;border-radius:8px;object-fit:contain" alt="Diagram"/></div>'
        else:
            diag_html = f'<div class="diag-box"><pre class="mermaid">{_esc_mermaid(dv)}</pre></div>'

    # Image
    img_html = ""
    if img:
        src = img.get("url") if isinstance(img, dict) else img
        if src:
            safe = src.replace("'", "%27").replace('"', '&quot;')
            # Build source page info from caption
            src_page = ""
            if caption:
                import re as _re
                m = _re.search(r'page\s*(\d+)', caption, _re.IGNORECASE)
                if m:
                    src_page = f"Source: Page {m.group(1)}"
            cap_esc = _esc(caption)
            src_esc = _esc(src_page)
            # Pass caption+source to lightbox as data attributes
            img_html = (
                f'<div class="img-card" onclick="openLightbox(\'{safe}\',\'{cap_esc}\',\'{src_esc}\')">'
                f'<img src="{safe}" class="img-main" alt="Slide image"/>'
                f'<div class="img-hint">🔍 Click to enlarge</div>'
                f'<div class="img-meta">'
                + (f'<div class="img-cap">{cap_esc}</div>' if caption else '')
                + (f'<div class="img-src">📄 {src_esc}</div>' if src_page else '')
                + f'</div>'
                f'</div>'
            )

    has_img  = bool(img_html)
    has_diag = bool(diag_html)

    # Layout decision
    if has_img and has_diag:
        # 3-zone: text left | image top-right + diagram bottom-right
        content_html = (
            f'<div class="layout-3col">'
            f'  <div class="col-text"><div class="bullet-list">{bhtml}</div></div>'
            f'  <div class="col-right">'
            f'    <div class="col-right-top">{img_html}</div>'
            f'    <div class="col-right-bot">{diag_html}</div>'
            f'  </div>'
            f'</div>'
        )
    elif has_img:
        content_html = (
            f'<div class="layout-2col">'
            f'  <div class="col-text"><div class="bullet-list">{bhtml}</div></div>'
            f'  <div class="col-media">{img_html}</div>'
            f'</div>'
        )
    elif has_diag:
        content_html = (
            f'<div class="layout-2col">'
            f'  <div class="col-text"><div class="bullet-list">{bhtml}</div></div>'
            f'  <div class="col-media">{diag_html}</div>'
            f'</div>'
        )
    else:
        content_html = f'<div class="layout-1col"><div class="bullet-list">{bhtml}</div></div>'

    return (
        f'<section class="slide s-content" data-idx="{i}" data-ac="{a}" style="--a:{a};--a2:{a2};--a3:{a3}">'
        f'<div class="slide-bg-orb orb1 sm" style="background:radial-gradient(circle,{a}15,transparent 70%)"></div>'
        f'{_particles(i, a)}'
        f'<div class="slide-accent-bar" style="background:linear-gradient(90deg,{a},{a2},{a3})"></div>'
        f'<div class="slide-inner">'
        f'  <div class="slide-header">'
        f'    <div class="slide-chip" style="background:rgba({r},{g},{b},.1);border-color:rgba({r},{g},{b},.2);color:{a}">SLIDE {i+1:02d}</div>'
        f'    <h2 class="slide-title">{title}</h2>'
        f'    <div class="title-rule" style="background:linear-gradient(90deg,{a},{a2}88,transparent)"></div>'
        f'  </div>'
        f'  {content_html}'
        f'</div>'
        f'<div class="slide-num">{num}</div>'
        f'<div class="notes" data-n="{notes}">{s.get("speaker_notes","")}</div>'
        f'</section>'
    ), ""
def _slide_comparison(s: dict, i: int, tot: int, t: dict, img: any, caption: str = "") -> tuple:
    title  = _esc(s.get("title", ""))
    notes  = _esc(s.get("speaker_notes", ""))
    bullets = s.get("bullets", [])
    num    = f"{i+1}/{tot}"
    a, a2, a3 = t["a"], t["a2"], t["a3"]
    r, g, b = _rgb(a)
    r2, g2, b2 = _rgb(a2)

    mid = max(1, len(bullets) // 2)
    left_pts  = bullets[:mid]
    right_pts = bullets[mid:]

    def _col(pts, ac, label, ra, ga, ba, delay):
        items = "".join(
            f'<li class="cmp-item" style="--d:{delay+j*0.08:.2f}s">'
            f'<span class="cmp-dot" style="background:{ac}"></span>'
            f'<span>{_esc(p.get("text","") if isinstance(p,dict) else str(p))}</span>'
            f'</li>'
            for j, p in enumerate(pts)
        )
        return (
            f'<div class="cmp-col" style="border-top:3px solid {ac}">'
            f'<div class="cmp-hdr" style="color:{ac};background:rgba({ra},{ga},{ba},.1)">{label}</div>'
            f'<ul class="cmp-list">{items}</ul>'
            f'</div>'
        )

    return (
        f'<section class="slide s-content" data-idx="{i}" data-ac="{a}" style="--a:{a};--a2:{a2};--a3:{a3}">'
        f'<div class="slide-bg-orb orb1 sm" style="background:radial-gradient(circle,{a}15,transparent 70%)"></div>'
        f'{_particles(i, a)}'
        f'<div class="slide-accent-bar" style="background:linear-gradient(90deg,{a},{a2},{a3})"></div>'
        f'<div class="slide-inner">'
        f'  <div class="slide-header">'
        f'    <div class="slide-chip" style="background:rgba({r},{g},{b},.1);border-color:rgba({r},{g},{b},.2);color:{a}">COMPARISON</div>'
        f'    <h2 class="slide-title">{title}</h2>'
        f'    <div class="title-rule" style="background:linear-gradient(90deg,{a},{a2}88,transparent)"></div>'
        f'  </div>'
        f'  <div class="cmp-grid">'
        f'    {_col(left_pts, a, "Approach A", r, g, b, 0.15)}'
        f'    <div class="cmp-vs" style="background:linear-gradient(135deg,{a},{a2})">VS</div>'
        f'    {_col(right_pts, a2, "Approach B", r2, g2, b2, 0.30)}'
        f'  </div>'
        f'</div>'
        f'<div class="slide-num">{num}</div>'
        f'<div class="notes" data-n="{notes}">{s.get("speaker_notes","")}</div>'
        f'</section>'
    ), ""

def _slide_outro(s: dict, i: int, tot: int, t: dict, img: any, topic: str) -> tuple:
    title = _esc(s.get("title", "Conclusion"))
    notes = _esc(s.get("speaker_notes", ""))
    bullets = s.get("bullets", [])
    num   = f"{i+1}/{tot}"
    a, a2, a3 = t["a"], t["a2"], t["a3"]
    r, g, b = _rgb(a)

    bhtml = "".join(
        f'<div class="outro-pt" style="--d:{0.3+j*0.1:.2f}s">'
        f'<span class="outro-dot" style="background:{a2 if j%2 else a}"></span>'
        f'<span>{_esc(bu.get("text","") if isinstance(bu,dict) else str(bu))}</span>'
        f'</div>'
        for j, bu in enumerate(bullets[:6])
    )

    return (
        f'<section class="slide s-outro" data-idx="{i}" data-ac="{a}" style="--a:{a};--a2:{a2};--a3:{a3}">'
        f'<div class="slide-bg-orb orb1" style="background:radial-gradient(circle,{a}35,transparent 70%)"></div>'
        f'<div class="slide-bg-orb orb2" style="background:radial-gradient(circle,{a2}20,transparent 70%)"></div>'
        f'{_particles(i, a)}'
        f'<div class="outro-body">'
        f'  <div class="outro-icon" style="border-color:{a};color:{a}">✦</div>'
        f'  <h2 class="outro-title" style="background:linear-gradient(135deg,{a},{a2});-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text">{title}</h2>'
        f'  <div class="outro-bar" style="background:linear-gradient(90deg,{a},{a2},{a3})"></div>'
        f'  <div class="outro-pts">{bhtml}</div>'
        f'  <div class="outro-topic" style="color:{a2}">{_esc(topic)}</div>'
        f'</div>'
        f'<div class="slide-num">{num}</div>'
        f'<div class="notes" data-n="{notes}">{s.get("speaker_notes","")}</div>'
        f'</section>'
    ), ""

def _slide_stats(s: dict, i: int, tot: int, t: dict, img: any, caption: str = "") -> tuple:
    title   = _esc(s.get("title", ""))
    bullets = s.get("bullets", [])
    notes   = _esc(s.get("speaker_notes", ""))
    num     = f"{i+1}/{tot}"
    a, a2, a3 = t["a"], t["a2"], t["a3"]
    r, g, b = _rgb(a)

    bhtml = ""
    for j, bu in enumerate(bullets):
        bull = bu.get("text", "") or bu.get("content", "") if isinstance(bu, dict) else str(bu)
        parts = bull.split(":", 1)
        kw    = _esc(parts[0].strip())
        rest  = _esc(parts[1].strip()) if len(parts) > 1 else ""
        ac    = a2 if j % 2 else a
        ra, ga, ba = _rgb(ac)
        d = 0.1 + j * 0.08
        bhtml += (
            f'<div class="bullet-card" style="--d:{d:.2f}s;border-left:3px solid {ac}">'
            f'<div class="bc-num" style="color:{ac};background:rgba({ra},{ga},{ba},.12)">{j+1:02d}</div>'
            f'<div class="bc-body"><span class="bc-kw" style="color:{ac}">{kw}</span>'
            + (f'<span class="bc-rest">{rest}</span>' if rest else '')
            + f'</div></div>'
        )

    chart_html = ""
    cdata = s.get("chart_data")
    if cdata and isinstance(cdata, dict) and cdata.get("labels") and cdata.get("values"):
        cid = f"chart_{i}"
        chart_html = (
            f'<div style="margin-top:20px;background:rgba({r},{g},{b},.04);'
            f'border:1px solid rgba({r},{g},{b},.1);border-radius:12px;padding:20px;'
            f'height:260px;opacity:0;animation:slide-up .6s ease both .5s">'
            f'<canvas id="{cid}"></canvas></div>'
        )
        js = _chart_js(cdata, cid, t)
    else:
        js = ""

    return (
        f'<section class="slide s-content" data-idx="{i}" data-ac="{a}" style="--a:{a};--a2:{a2};--a3:{a3}">'
        f'<div class="slide-bg-orb orb1 sm" style="background:radial-gradient(circle,{a}15,transparent 70%)"></div>'
        f'{_particles(i, a)}'
        f'<div class="slide-accent-bar" style="background:linear-gradient(90deg,{a},{a2},{a3})"></div>'
        f'<div class="slide-inner">'
        f'  <div class="slide-header">'
        f'    <div class="slide-chip" style="background:rgba({r},{g},{b},.1);border-color:rgba({r},{g},{b},.2);color:{a}">STATISTICS</div>'
        f'    <h2 class="slide-title">{title}</h2>'
        f'    <div class="title-rule" style="background:linear-gradient(90deg,{a},{a2}88,transparent)"></div>'
        f'  </div>'
        f'  <div class="layout-1col"><div class="bullet-list">{bhtml}</div>{chart_html}</div>'
        f'</div>'
        f'<div class="slide-num">{num}</div>'
        f'<div class="notes" data-n="{notes}">{s.get("speaker_notes","")}</div>'
        f'</section>'
    ), js

# ── CSS ───────────────────────────────────────────────────────────────────────
def _css(t: dict) -> str:
    bg, bg2  = t["bg"], t["bg2"]
    surf, brd = t["surf"], t["brd"]
    ink, muted = t["ink"], t["muted"]
    a, a2, a3 = t["a"], t["a2"], t["a3"]
    r, g, b = _rgb(a)
    r2, g2, b2 = _rgb(a2)
    blend = "screen" if t["dark"] else "multiply"
    return f"""
*,*::before,*::after{{box-sizing:border-box;margin:0;padding:0}}
:root{{--a:{a};--a2:{a2};--a3:{a3};--bg:{bg};--ink:{ink};--muted:{muted};--surf:{surf};--brd:{brd}}}
html,body{{width:100%;height:100%;overflow:hidden;background:{bg};color:{ink};font-family:'Inter','DM Sans',system-ui,sans-serif;cursor:none;-webkit-font-smoothing:antialiased}}

/* ── Cursor ── */
#cur{{position:fixed;width:10px;height:10px;border-radius:50%;background:{a};pointer-events:none;z-index:9999;transform:translate(-50%,-50%);mix-blend-mode:{blend};transition:transform .1s}}
#cur2{{position:fixed;width:32px;height:32px;border:1.5px solid {a};border-radius:50%;pointer-events:none;z-index:9998;transform:translate(-50%,-50%);opacity:.25;transition:left .06s,top .06s}}

/* ── Deck ── */
#deck{{position:fixed;inset:0}}
.slide{{position:absolute;inset:0;background:{bg};overflow:hidden;display:flex;flex-direction:column;opacity:0;pointer-events:none;transform:translateX(60px) scale(.97);transition:none}}
.slide.active{{opacity:1;pointer-events:all;transform:none;transition:transform .55s cubic-bezier(.22,1,.36,1),opacity .3s}}
.slide.xl{{opacity:0;transform:translateX(-60px) scale(.97)}}
.slide.xr{{opacity:0;transform:translateX(60px) scale(.97)}}

/* ── Background orbs ── */
.slide-bg-orb{{position:absolute;border-radius:50%;filter:blur(110px);pointer-events:none;z-index:0}}
.orb1{{width:55vw;height:55vw;top:-20%;left:-15%;animation:orb-drift 20s ease-in-out infinite alternate}}
.orb2{{width:45vw;height:45vw;bottom:-15%;right:-10%;animation:orb-drift 26s ease-in-out infinite alternate-reverse}}
.orb3{{width:35vw;height:35vw;top:35%;left:35%;animation:orb-drift 17s ease-in-out infinite alternate}}
.sm{{width:32vw;height:32vw}}
@keyframes orb-drift{{0%{{transform:translate(0,0) scale(1)}}50%{{transform:translate(4%,5%) scale(1.06)}}100%{{transform:translate(-2%,3%) scale(.96)}}}}

/* ── Animated grid background ── */
.slide::before{{content:'';position:absolute;inset:0;z-index:0;pointer-events:none;
  background-image:linear-gradient(rgba({r},{g},{b},.03) 1px,transparent 1px),linear-gradient(90deg,rgba({r},{g},{b},.03) 1px,transparent 1px);
  background-size:52px 52px;
  animation:grid-pan 50s linear infinite}}
@keyframes grid-pan{{from{{background-position:0 0}}to{{background-position:52px 52px}}}}

/* ── Particles ── */
.pc{{position:absolute;inset:0;z-index:1;opacity:.35;pointer-events:none}}

/* ── Accent bar (top) ── */
.slide-accent-bar{{position:absolute;top:0;left:0;right:0;height:3px;z-index:10}}

/* ── Slide inner wrapper ── */
.slide-inner{{position:relative;z-index:5;display:flex;flex-direction:column;width:100%;height:100%;padding:52px 64px 44px;gap:0}}
.slide-inner.centered{{align-items:center;justify-content:center;text-align:center}}

/* ── Slide header ── */
.slide-header{{flex-shrink:0;margin-bottom:28px}}
.slide-chip{{display:inline-flex;align-items:center;font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;padding:5px 14px;border-radius:100px;border:1px solid;margin-bottom:14px}}
.slide-title{{font-family:'Plus Jakarta Sans','Inter',sans-serif;font-size:clamp(28px,3.2vw,52px);font-weight:800;letter-spacing:-1.5px;line-height:1.12;color:{ink};margin-bottom:16px}}
.title-rule{{height:2px;width:56px;border-radius:2px;margin-bottom:0}}

/* ── Bullet list ── */
.bullet-list{{display:flex;flex-direction:column;gap:10px}}
.bullet-card{{display:flex;align-items:flex-start;gap:14px;padding:12px 16px;border-radius:10px;background:rgba({r},{g},{b},.05);border-left:3px solid {a};opacity:0;animation:slide-up .5s ease both var(--d)}}
@keyframes slide-up{{from{{opacity:0;transform:translateY(16px)}}to{{opacity:1;transform:none}}}}
.bc-num{{flex-shrink:0;width:28px;height:28px;border-radius:7px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;font-family:monospace;margin-top:2px}}
.bc-body{{flex:1;min-width:0}}
.bc-kw{{display:block;font-size:16px;font-weight:700;line-height:1.3;margin-bottom:4px}}
.bc-rest{{display:block;font-size:14.5px;font-weight:400;line-height:1.6;color:{muted}}}
.src-tag{{display:inline-block;margin-left:8px;font-size:11px;font-weight:500;background:rgba(255,255,255,.07);padding:2px 8px;border-radius:4px;color:{muted}}}

/* ── Layouts ── */
.layout-1col{{flex:1;display:flex;flex-direction:column;justify-content:center;min-height:0}}
.layout-2col{{flex:1;display:grid;grid-template-columns:1fr 42%;gap:32px;align-items:center;min-height:0}}
.layout-3col{{flex:1;display:grid;grid-template-columns:1fr 40%;gap:28px;align-items:stretch;min-height:0}}
.col-text{{display:flex;flex-direction:column;justify-content:center;min-width:0;min-height:0}}
.col-media{{display:flex;flex-direction:column;justify-content:center;min-width:0;min-height:0}}
.col-right{{display:flex;flex-direction:column;gap:16px;min-width:0;min-height:0}}
.col-right-top{{flex:1;min-height:0}}
.col-right-bot{{flex:1;min-height:0}}

/* ── Image card ── */
.img-card{{position:relative;border-radius:14px;overflow:hidden;cursor:pointer;background:rgba({r},{g},{b},.06);border:1px solid rgba({r},{g},{b},.18);box-shadow:0 20px 48px rgba(0,0,0,.45);opacity:0;animation:slide-up .5s ease both .15s;height:100%;display:flex;flex-direction:column}}
.img-card:hover .img-hint{{opacity:1}}
.img-main{{width:100%;flex:1;object-fit:cover;display:block;min-height:0;max-height:340px}}
.img-hint{{position:absolute;top:0;left:0;right:0;bottom:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.45);color:#fff;font-size:13px;font-weight:500;opacity:0;transition:opacity .2s;backdrop-filter:blur(2px)}}
.img-meta{{flex-shrink:0;padding:10px 14px;background:rgba({r},{g},{b},.08);border-top:1px solid rgba({r},{g},{b},.12)}}
.img-cap{{font-size:13px;font-weight:500;color:{ink};line-height:1.45;margin-bottom:4px}}
.img-src{{font-size:11px;font-weight:400;color:{a};opacity:.85;display:flex;align-items:center;gap:5px}}

/* ── Diagram box ── */
.diag-box{{border-radius:14px;overflow:hidden;background:rgba({r},{g},{b},.04);border:1px solid rgba({r},{g},{b},.14);padding:16px;display:flex;align-items:center;justify-content:center;min-height:120px;opacity:0;animation:slide-up .5s ease both .25s;height:100%}}
.mermaid{{background:transparent !important;color:{ink} !important;width:100%}}
.mermaid svg{{max-width:100%;height:auto;filter:drop-shadow(0 6px 14px rgba(0,0,0,.3))}}

/* ── Cover slide ── */
.cover-body{{position:relative;z-index:5;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:60px 80px;height:100%}}
.cover-chip{{font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;padding:7px 20px;border-radius:100px;margin-bottom:32px;opacity:0;animation:slide-up .6s ease both .1s}}
.cover-title{{font-family:'Plus Jakarta Sans','Inter',sans-serif;font-size:clamp(40px,6vw,88px);font-weight:800;letter-spacing:-3px;line-height:1.05;color:{ink};margin-bottom:32px;opacity:0;animation:slide-up .7s ease both .2s;max-width:900px}}
.cover-bar{{height:4px;width:120px;border-radius:4px;margin:0 auto 36px;opacity:0;animation:slide-up .6s ease both .35s}}
.cover-keys{{display:flex;gap:20px;flex-wrap:wrap;justify-content:center;opacity:0;animation:slide-up .6s ease both .5s}}
.ck{{display:flex;align-items:center;gap:7px;font-size:12px;color:{muted}}}
.ck kbd{{background:rgba({r},{g},{b},.15);border:1px solid rgba({r},{g},{b},.25);padding:3px 9px;border-radius:6px;font-family:monospace;font-size:11px;color:{ink}}}

/* ── Intro slide ── */
.intro-points{{display:flex;flex-direction:column;gap:12px;max-width:680px;margin-top:28px;text-align:left}}
.intro-point{{display:flex;align-items:flex-start;gap:12px;opacity:0;animation:slide-up .5s ease both var(--d)}}
.ipdot{{width:8px;height:8px;border-radius:50%;flex-shrink:0;margin-top:7px}}
.iptext{{font-size:17px;line-height:1.7;color:{muted}}}

/* ── Comparison ── */
.cmp-grid{{flex:1;display:grid;grid-template-columns:1fr auto 1fr;gap:20px;align-items:start;min-height:0}}
.cmp-col{{border-radius:14px;overflow:hidden;background:rgba({r},{g},{b},.04);border:1px solid rgba({r},{g},{b},.12)}}
.cmp-hdr{{font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;padding:12px 18px}}
.cmp-list{{list-style:none;padding:14px 18px;display:flex;flex-direction:column;gap:10px}}
.cmp-item{{display:flex;align-items:flex-start;gap:10px;font-size:15px;line-height:1.55;color:{muted};opacity:0;animation:slide-up .5s ease both var(--d)}}
.cmp-dot{{width:6px;height:6px;border-radius:50%;flex-shrink:0;margin-top:6px}}
.cmp-vs{{width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;color:#fff;align-self:center;flex-shrink:0;box-shadow:0 8px 24px rgba(0,0,0,.4)}}

/* ── Outro ── */
.s-outro{{display:flex;align-items:center;justify-content:center}}
.outro-body{{position:relative;z-index:5;display:flex;flex-direction:column;align-items:center;text-align:center;padding:60px;max-width:800px}}
.outro-icon{{width:72px;height:72px;border-radius:50%;border:2px solid;display:flex;align-items:center;justify-content:center;font-size:28px;margin-bottom:28px;opacity:0;animation:slide-up .6s ease both .1s}}
.outro-title{{font-family:'Plus Jakarta Sans','Inter',sans-serif;font-size:clamp(36px,5vw,72px);font-weight:800;letter-spacing:-2px;line-height:1.1;margin-bottom:20px;opacity:0;animation:slide-up .6s ease both .2s}}
.outro-bar{{height:3px;width:80px;border-radius:3px;margin:0 auto 32px;opacity:0;animation:slide-up .5s ease both .3s}}
.outro-pts{{display:flex;flex-direction:column;gap:10px;margin-bottom:28px;text-align:left;width:100%;max-width:560px}}
.outro-pt{{display:flex;align-items:flex-start;gap:12px;font-size:15px;line-height:1.6;color:{muted};opacity:0;animation:slide-up .5s ease both var(--d)}}
.outro-dot{{width:7px;height:7px;border-radius:50%;flex-shrink:0;margin-top:7px}}
.outro-topic{{font-size:15px;color:{muted};opacity:.6;opacity:0;animation:slide-up .5s ease both .7s}}

/* ── HUD ── */
#hud{{position:fixed;top:0;left:0;right:0;z-index:200;display:flex;align-items:center;justify-content:space-between;padding:14px 24px;pointer-events:none;background:linear-gradient(to bottom,rgba({r},{g},{b},.08),transparent)}}
#hud-title{{font-size:12px;font-weight:600;color:{muted};opacity:.7;max-width:40%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}}
.hbtns{{display:flex;gap:6px;pointer-events:all}}
.hb{{background:rgba({r},{g},{b},.1);border:1px solid rgba({r},{g},{b},.18);padding:6px 14px;border-radius:8px;color:{ink};cursor:pointer;font-size:11px;font-weight:500;transition:all .15s;backdrop-filter:blur(12px)}}
.hb:hover{{background:rgba({r},{g},{b},.22);border-color:rgba({r},{g},{b},.35)}}
.hb.on{{background:{a};border-color:{a};color:#fff}}

/* ── Progress ── */
#prog{{position:fixed;bottom:0;left:0;right:0;height:3px;z-index:200;background:rgba({r},{g},{b},.08)}}
#pf{{height:100%;background:linear-gradient(90deg,{a},{a2});transition:width .4s cubic-bezier(.22,1,.36,1)}}

/* ── Nav arrows ── */
#navp,#navn{{position:fixed;top:50%;transform:translateY(-50%);z-index:200;width:44px;height:44px;display:flex;align-items:center;justify-content:center;color:{muted};font-size:26px;cursor:pointer;border-radius:50%;transition:all .2s;background:rgba({r},{g},{b},.06);border:1px solid rgba({r},{g},{b},.1)}}
#navp{{left:12px}}#navn{{right:12px}}
#navp:hover,#navn:hover{{background:rgba({r},{g},{b},.18);color:{ink}}}

/* ── Slide number ── */
.slide-num{{position:absolute;bottom:18px;left:24px;font-size:13px;font-weight:600;color:{ink};opacity:.55;z-index:10;font-family:monospace;letter-spacing:.04em;background:rgba({r},{g},{b},.1);padding:4px 10px;border-radius:6px;border:1px solid rgba({r},{g},{b},.15)}}

/* ── Notes ── */
.notes{{display:none;position:fixed;bottom:0;left:0;right:0;background:rgba({r},{g},{b},.96);backdrop-filter:blur(20px);padding:24px 60px;font-family:monospace;font-size:13px;line-height:1.6;z-index:300;border-top:1px solid rgba({r},{g},{b},.2)}}
.notes-on .notes{{display:block}}

/* ── Lightbox ── */
#lightbox{{display:none;position:fixed;inset:0;z-index:9000;background:rgba(0,0,0,.94);align-items:center;justify-content:center;cursor:zoom-out;backdrop-filter:blur(12px)}}
#lightbox.open{{display:flex}}
#lb-content{{display:flex;flex-direction:column;align-items:center;gap:0;cursor:default;max-width:90vw}}
#lb-img{{max-width:88vw;max-height:78vh;object-fit:contain;border-radius:12px 12px 0 0;box-shadow:0 40px 100px rgba(0,0,0,.8);animation:lb-in .22s ease;display:block}}
#lb-meta{{width:100%;background:rgba(20,20,30,.95);border-radius:0 0 12px 12px;padding:14px 20px;border:1px solid rgba(255,255,255,.08);border-top:none}}
#lb-cap{{font-size:15px;font-weight:500;color:#f0eeff;line-height:1.5;margin-bottom:5px}}
#lb-src{{font-size:12px;color:{a};font-weight:500;opacity:.85}}
#lb-cap:empty,#lb-src:empty{{display:none}}
@keyframes lb-in{{from{{opacity:0;transform:scale(.88)}}to{{opacity:1;transform:scale(1)}}}}
#lb-close{{position:absolute;top:18px;right:24px;color:#fff;font-size:32px;cursor:pointer;opacity:.55;line-height:1;z-index:9001;transition:opacity .15s}}
#lb-close:hover{{opacity:1}}
"""

# ── JS ────────────────────────────────────────────────────────────────────────
_JS = r"""
(function(){
  function init(c){
    if(!c||c._i)return;c._i=true;
    const ac=c.dataset.ac||'#7c5cfc',ctx=c.getContext('2d'),sec=c.parentElement;
    let W=c.width=sec.offsetWidth,H=c.height=sec.offsetHeight;
    const rv=parseInt(ac.slice(1,3),16),gv=parseInt(ac.slice(3,5),16),bv=parseInt(ac.slice(5,7),16);
    const pts=Array.from({length:60},()=>({
      x:Math.random()*W,y:Math.random()*H,vx:(Math.random()-.5)*.4,vy:(Math.random()-.5)*.4,r:Math.random()*2+1,a:Math.random()*.3+.1
    }));
    function draw(){
      ctx.clearRect(0,0,W,H);
      pts.forEach(p=>{
        p.x+=p.vx;p.y+=p.vy;
        if(p.x<0||p.x>W)p.vx*=-1;if(p.y<0||p.y>H)p.vy*=-1;
        ctx.save();ctx.globalAlpha=p.a;ctx.fillStyle=`rgba(${rv},${gv},${bv},1)`;
        ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fill();ctx.restore();
      });
      requestAnimationFrame(draw);
    }
    draw();
  }
  function initMermaid(){
    if(window.mermaid){
      mermaid.initialize({
        startOnLoad:false,
        theme:'dark',
        securityLevel:'loose',
        flowchart:{useMaxWidth:true,htmlLabels:true},
        suppressErrorRendering:true
      });
      // Render all mermaid diagrams on active slide
      setTimeout(function(){
        const active = document.querySelector('.slide.active');
        if(active){
          const diagrams = active.querySelectorAll('.mermaid');
          diagrams.forEach(function(el, idx){
            try {
              mermaid.render('mermaid-'+idx, el.textContent).then(function(result){
                el.innerHTML = result.svg;
              }).catch(function(err){
                console.warn('Mermaid render failed:', err);
                el.innerHTML = '<div style="color:#ff6b6b;padding:10px">Diagram unavailable</div>';
              });
            } catch(e) {
              console.warn('Mermaid error:', e);
            }
          });
        }
      }, 100);
    }
  }
  window._PI=init;
  window._IM=initMermaid;
})();

const SL=Array.from(document.querySelectorAll('.slide'));
let cur=0,notesOn=false;

function goTo(n,fwd=true){
  if(n<0||n>=TOT)return;
  SL[cur].classList.remove('active');
  SL[cur].classList.add(fwd?'xl':'xr');
  SL[n].classList.remove('xl','xr');
  SL[n].classList.add('active');
  const pc=SL[n].querySelector('.pc');if(pc)window._PI(pc);
  // Render mermaid diagrams on the new slide
  if(window.mermaid){
    const diagrams = SL[n].querySelectorAll('.mermaid:not([data-processed])');
    diagrams.forEach(function(el, idx){
      el.setAttribute('data-processed', 'true');
      const code = el.textContent;
      mermaid.render('mermaid-'+n+'-'+idx, code).then(function(result){
        el.innerHTML = result.svg;
      }).catch(function(err){
        console.warn('Mermaid render failed:', err);
        el.innerHTML = '<div style="color:#ff6b6b;padding:10px;font-size:12px">Diagram unavailable</div>';
      });
    });
  }
  cur=n;upd();
}
function fwd(){goTo(cur+1,true)}
function bwd(){goTo(cur-1,false)}
function upd(){
  document.getElementById('pf').style.width=((cur)/(TOT-1)*100)+'%';
  SL.forEach((s,i)=>s.classList.toggle('notes-on',notesOn&&i===cur));
}
function toggleNotes(){notesOn=!notesOn;upd();document.getElementById('btn-n').classList.toggle('on',notesOn);}
function toggleFS(){
  if(!document.fullscreenElement)document.documentElement.requestFullscreen();
  else document.exitFullscreen();
}
function openLightbox(src,cap,srcInfo){
  document.getElementById('lb-img').src=src;
  document.getElementById('lb-cap').textContent=cap||'';
  document.getElementById('lb-src').textContent=srcInfo||'';
  document.getElementById('lightbox').classList.add('open');
}
function closeLightbox(){
  document.getElementById('lightbox').classList.remove('open');
  document.getElementById('lb-img').src='';
}
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){closeLightbox();return;}
  if(e.key==='ArrowRight'||e.key===' ')fwd();
  if(e.key==='ArrowLeft')bwd();
  if(e.key==='n')toggleNotes();
  if(e.key==='f')toggleFS();
});
document.addEventListener('mousemove',e=>{
  const c=document.getElementById('cur'),r=document.getElementById('cur2');
  c.style.left=e.clientX+'px';c.style.top=e.clientY+'px';
  r.style.left=e.clientX+'px';r.style.top=e.clientY+'px';
});
(function init(){
  SL[0].classList.add('active');
  const pc=SL[0].querySelector('.pc');if(pc)window._PI(pc);
  window._IM();
  upd();
})();
"""

def render(
    topic:      str,
    slides:     list,
    session_id: str,
    output_dir: str,
    images:     dict = None,
    theme_name: str = None,
    captions:   dict = None,
) -> str:
    html_theme = _PPTX_TO_HTML_THEME.get(theme_name, theme_name)
    theme = THEMES.get(html_theme) or THEMES[_auto_theme(session_id)]
    total = len(slides)
    sections = []
    charts = []
    captions = captions or {}

    for i, s in enumerate(slides):
        stype = s.get("slide_type") or s.get("type") or "content"
        img = (images or {}).get(i) or (images or {}).get(s.get("image_id"))
        cap = s.get("caption") or captions.get(i, "")
        
        js_chart = ""
        if i == 0:     h, js_chart = _slide_cover(s, i, total, theme, img)
        elif i == total-1: h, js_chart = _slide_outro(s, i, total, theme, img, topic)
        elif stype == "comparison": h, js_chart = _slide_comparison(s, i, total, theme, img, cap)
        elif stype == "stats" or s.get("chart_data"): h, js_chart = _slide_stats(s, i, total, theme, img, cap)
        elif stype == "intro": h, js_chart = _slide_intro(s, i, total, theme, img, cap)
        else:          h, js_chart = _slide_content(s, i, total, theme, img, cap)
        
        sections.append(h)
        if js_chart: charts.append(js_chart)

    te = _esc(topic)
    html = f"""<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>{te}</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@700;800&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet"/>
<style>{_css(theme)}</style></head>
<body>
<div id="cur"></div><div id="cur2"></div>
<div id="lightbox" onclick="closeLightbox()">
  <span id="lb-close" onclick="closeLightbox()">&#x2715;</span>
  <div id="lb-content" onclick="event.stopPropagation()">
    <img id="lb-img" src="" alt=""/>
    <div id="lb-meta">
      <div id="lb-cap"></div>
      <div id="lb-src"></div>
    </div>
  </div>
</div>
<div id="hud">
  <div id="hud-title">{te}</div>
  <div class="hbtns">
    <button class="hb" id="btn-n" onclick="toggleNotes()">Notes</button>
    <button class="hb" onclick="toggleFS()">Fullscreen</button>
  </div>
</div>
<div id="prog"><div id="pf"></div></div>
<div id="navp" onclick="bwd()">&#8249;</div>
<div id="navn" onclick="fwd()">&#8250;</div>
<div id="deck">{"".join(sections)}</div>
<script>const TOT={total}; {"".join(charts)} \n {_JS}</script>
</body></html>"""

    os.makedirs(output_dir, exist_ok=True)
    path = os.path.join(output_dir, f"pres_{session_id[:8]}.html")
    with open(path, "w", encoding="utf-8") as f:
        f.write(html)
    return path