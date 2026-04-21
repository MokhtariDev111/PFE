"""
pdf_generator.py — TEK-UP official exam PDF generator
======================================================
Generates two PDFs from a structured exam dict:
  • Exam sheet  — clean questions, no answers (for students)
  • Answer key  — same structure with correct answers shown in green (for teacher)
"""

import base64
import io
import os

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import (
    BaseDocTemplate, Frame, HRFlowable, Image,
    KeepTogether, PageBreak, PageTemplate,
    Paragraph, Spacer, Table, TableStyle,
)

PAGE_W, PAGE_H = A4
MARGIN = 2.0 * cm
CONTENT_W = PAGE_W - 2 * MARGIN

_LOGO = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "public", "TEK-UP.png")
)

GREEN = colors.HexColor("#1a5c2e")
DARK  = colors.HexColor("#111111")


# ── Styles ────────────────────────────────────────────────────────────────────

def _make_styles():
    return {
        "school_title": ParagraphStyle(
            "school_title", fontName="Helvetica-Bold", fontSize=13,
            alignment=TA_CENTER, leading=17,
        ),
        "hdr_val": ParagraphStyle(
            "hdr_val", fontName="Helvetica", fontSize=10, leading=15,
        ),
        "exercise_h": ParagraphStyle(
            "exercise_h", fontName="Helvetica-Bold", fontSize=12,
            spaceBefore=14, spaceAfter=5, leading=16,
        ),
        "body": ParagraphStyle(
            "body", fontName="Helvetica", fontSize=10,
            alignment=TA_JUSTIFY, leading=15, spaceAfter=3,
        ),
        "q_num": ParagraphStyle(
            "q_num", fontName="Helvetica-Bold", fontSize=10,
            leading=14, spaceBefore=7,
        ),
        "q_text": ParagraphStyle(
            "q_text", fontName="Helvetica", fontSize=10,
            leading=14, alignment=TA_JUSTIFY,
        ),
        "option": ParagraphStyle(
            "option", fontName="Helvetica", fontSize=10,
            leading=13, leftIndent=18,
        ),
        "correct_opt": ParagraphStyle(
            "correct_opt", fontName="Helvetica-Bold", fontSize=10,
            leading=13, leftIndent=18, textColor=GREEN,
        ),
        "model_ans": ParagraphStyle(
            "model_ans", fontName="Helvetica", fontSize=10,
            leading=14, leftIndent=18, alignment=TA_JUSTIFY,
            textColor=GREEN,
        ),
        "key_label": ParagraphStyle(
            "key_label", fontName="Helvetica-Bold", fontSize=9,
            leftIndent=18, spaceBefore=4, textColor=GREEN,
        ),
        "key_pt": ParagraphStyle(
            "key_pt", fontName="Helvetica-Oblique", fontSize=9,
            leading=12, leftIndent=30, textColor=GREEN,
        ),
        "code": ParagraphStyle(
            "code", fontName="Courier", fontSize=9,
            leading=12, leftIndent=12, spaceAfter=2,
        ),
        "subq_label": ParagraphStyle(
            "subq_label", fontName="Helvetica-Bold", fontSize=10,
            spaceBefore=6, leading=14,
        ),
        "answer_space": ParagraphStyle(
            "answer_space", fontName="Helvetica-Oblique", fontSize=9,
            textColor=colors.grey, leftIndent=18,
        ),
    }


# ── Page template (footer with page number) ───────────────────────────────────

def _on_page(canvas, doc):
    canvas.saveState()
    canvas.setFont("Helvetica", 9)
    canvas.setFillColor(colors.grey)
    canvas.drawString(MARGIN, 0.9 * cm, f"Page {doc.page}")
    canvas.restoreState()


def _make_doc(buf):
    doc = BaseDocTemplate(
        buf, pagesize=A4,
        leftMargin=MARGIN, rightMargin=MARGIN,
        topMargin=MARGIN, bottomMargin=1.6 * cm,
    )
    frame = Frame(MARGIN, 1.6 * cm, CONTENT_W, PAGE_H - 2 * MARGIN - 0.2 * cm,
                  id="main", showBoundary=0)
    doc.addPageTemplates([PageTemplate(id="p", frames=[frame], onPage=_on_page)])
    return doc


# ── Header table ──────────────────────────────────────────────────────────────

def _header_flowables(header: dict, s: dict, is_key: bool) -> list:
    items = []

    # ── 1. Logo (standalone, top-left) ────────────────────────────────────────
    if os.path.exists(_LOGO):
        logo = Image(_LOGO, width=3.8 * cm, height=2.5 * cm, kind="proportional")
        logo.hAlign = "LEFT"
        items.append(logo)
        items.append(Spacer(1, 0.2 * cm))

    # ── 2. Title box (separate bordered box, full width) ──────────────────────
    title_style = ParagraphStyle(
        "tbl_title", fontName="Helvetica-Bold", fontSize=14,
        alignment=TA_CENTER, leading=18,
    )
    title_txt = "<b>Ecole Supérieure Privée Technologies &amp; Ingénierie</b>"
    if is_key:
        title_txt += "<br/><font color='#cc0000'>— CORRIGÉ —</font>"

    title_tbl = Table([[Paragraph(title_txt, title_style)]], colWidths=[CONTENT_W])
    title_tbl.setStyle(TableStyle([
        ("BOX",           (0, 0), (-1, -1), 1.5, colors.black),
        ("TOPPADDING",    (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ("LEFTPADDING",   (0, 0), (-1, -1), 8),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 8),
    ]))
    items.append(title_tbl)
    items.append(Spacer(1, 0.08 * cm))

    # ── 3. Data rows — 2-column table, horizontal separators only ────────────────
    hb = ParagraphStyle("hb", fontName="Helvetica-Bold", fontSize=10, leading=13)
    hv = ParagraphStyle("hv", fontName="Helvetica",      fontSize=10, leading=13)

    def B(text): return Paragraph(f"<b>{text}</b>", hb)
    def V(val):  return Paragraph(f"&nbsp;:&nbsp;&nbsp;{val or ''}", hv)

    year = header.get("academic_year", "2024-2025")
    sem  = header.get("semester", "1")
    date = header.get("date", "")
    dur  = header.get("duration", "")

    # 2 columns only — eliminates all vertical-line rendering artifacts
    c1 = 5.0 * cm
    c2 = CONTENT_W - c1

    rows = [
        [B("Type d'épreuve"),
         Paragraph(f"&nbsp;:&nbsp;&nbsp;{header.get('exam_type','Devoir')}"
                   f"&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"
                   f"&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"
                   f"&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"
                   f"&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<b>■</b>", hv)],
        [B("Enseignant"),          V(header.get("teacher", ""))],
        [B("Matière"),             V(header.get("subject", header.get("topic", "")))],
        [B("Année Universitaire"),
         Paragraph(f"&nbsp;:&nbsp;&nbsp;{year}"
                   f"&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"
                   f"&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"
                   f"<b>Semestre</b>&nbsp;:&nbsp;{sem}", hv)],
        [B("Classe"),              V(header.get("class_name", ""))],
        [B("Documents"),           V(header.get("documents", "Non autorisés"))],
        [B("Date"),
         Paragraph(f"&nbsp;:&nbsp;&nbsp;{date}"
                   f"&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"
                   f"&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"
                   f"&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"
                   f"<b>Durée</b>&nbsp;:&nbsp;{dur}", hv)],
        [B("Nombre de pages"),     V(header.get("_total_pages", ""))],
        [B("Barème"),              V(header.get("bareme", ""))],
    ]

    data_tbl = Table(rows, colWidths=[c1, c2])
    data_tbl.setStyle(TableStyle([
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING",    (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ("LEFTPADDING",   (0, 0), (-1, -1), 4),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 4),
    ]))
    items.append(data_tbl)

    # ── 4. Thick bottom HR (matches the <hr> in the HTML reference) ───────────
    items.append(Spacer(1, 0.15 * cm))
    items.append(HRFlowable(width=CONTENT_W, thickness=1.5, color=colors.black))
    items.append(Spacer(1, 0.45 * cm))

    return items


# ── Question blocks ───────────────────────────────────────────────────────────

def _safe(text: str) -> str:
    """Escape ampersands for reportlab XML."""
    return (text or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _mcq_block(questions: list, s: dict, is_key: bool, ex_num: int) -> list:
    label = "Questions à Choix Multiple (QCM)" if not is_key else "Questions à Choix Multiple — Corrigé"
    items = [Paragraph(f"<b>Exercice {ex_num}</b> — {label}", s["exercise_h"])]

    for idx, q in enumerate(questions, 1):
        block = [Paragraph(f"{idx}. {_safe(q['question'])}", s["q_text"])]
        for oi, opt in enumerate(q.get("options", [])):
            correct = oi == q.get("correct", -1)
            if is_key and correct:
                block.append(Paragraph(f"✓ {_safe(opt)}", s["correct_opt"]))
            else:
                block.append(Paragraph(_safe(opt), s["option"]))
        if is_key:
            expl = q.get("explanation", "")
            if expl:
                block.append(Paragraph(f"<i>{_safe(expl)}</i>", s["model_ans"]))
        block.append(Spacer(1, 0.15 * cm))
        items.append(KeepTogether(block))

    return items


def _tf_block(questions: list, s: dict, is_key: bool, ex_num: int) -> list:
    label = "Vrai ou Faux" if not is_key else "Vrai ou Faux — Corrigé"
    items = [Paragraph(f"<b>Exercice {ex_num}</b> — {label}", s["exercise_h"])]

    for idx, q in enumerate(questions, 1):
        answer_str = "Vrai ✓" if q.get("correct") else "Faux ✓"
        block = [Paragraph(f"{idx}. {_safe(q['question'])}", s["q_text"])]
        if is_key:
            block.append(Paragraph(answer_str, s["correct_opt"]))
            expl = q.get("explanation", "")
            if expl:
                block.append(Paragraph(f"<i>{_safe(expl)}</i>", s["model_ans"]))
        else:
            block.append(Paragraph("□ Vrai       □ Faux", s["option"]))
        block.append(Spacer(1, 0.15 * cm))
        items.append(KeepTogether(block))

    return items


def _problem_block(q: dict, s: dict, is_key: bool, ex_num: int) -> list:
    items = [Paragraph(f"<b>Exercice {ex_num}</b>", s["exercise_h"])]
    items.append(Paragraph(_safe(q["question"]), s["body"]))

    if is_key:
        items.append(Spacer(1, 0.2 * cm))
        items.append(Paragraph("<b>Réponse modèle :</b>", s["key_label"]))
        items.append(Paragraph(_safe(q.get("model_answer", "")), s["model_ans"]))
        key_pts = q.get("key_points", [])
        if key_pts:
            items.append(Paragraph("<b>Points clés :</b>", s["key_label"]))
            for pt in key_pts:
                items.append(Paragraph(f"• {_safe(pt)}", s["key_pt"]))
    else:
        # Leave answer space
        items.append(Spacer(1, 0.3 * cm))
        for _ in range(5):
            items.append(HRFlowable(width=CONTENT_W, thickness=0.3, color=colors.lightgrey))
            items.append(Spacer(1, 0.35 * cm))

    return items


def _casestudy_block(q: dict, s: dict, is_key: bool, ex_num: int) -> list:
    items = [Paragraph(f"<b>Exercice {ex_num}</b>", s["exercise_h"])]

    # Context
    items.append(Paragraph(_safe(q.get("context", "")), s["body"]))
    items.append(Spacer(1, 0.2 * cm))

    # Data table
    tbl_data = q.get("table", {})
    headers = tbl_data.get("headers", [])
    rows    = tbl_data.get("rows", [])
    if headers and rows:
        table_content = [[Paragraph(f"<b>{_safe(h)}</b>", s["q_text"]) for h in headers]]
        for row in rows:
            table_content.append([Paragraph(_safe(str(c)), s["q_text"]) for c in row])
        col_w = CONTENT_W / max(len(headers), 1)
        data_tbl = Table(table_content, colWidths=[col_w] * len(headers))
        data_tbl.setStyle(TableStyle([
            ("BOX",         (0, 0), (-1, -1), 0.8, colors.black),
            ("INNERGRID",   (0, 0), (-1, -1), 0.4, colors.black),
            ("BACKGROUND",  (0, 0), (-1, 0),  colors.HexColor("#e8e8e8")),
            ("ALIGN",       (0, 0), (-1, -1), "CENTER"),
            ("TOPPADDING",  (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING",(0,0), (-1, -1), 3),
            ("LEFTPADDING", (0, 0), (-1, -1), 4),
            ("RIGHTPADDING",(0, 0), (-1, -1), 4),
        ]))
        items.append(data_tbl)
        items.append(Spacer(1, 0.3 * cm))

    # Sub-questions
    for subq in q.get("subquestions", []):
        pts   = subq.get("points", "")
        sid   = subq.get("id", "")
        pts_label = f" ({pts} pts)" if pts else ""
        items.append(Paragraph(
            f"<b>{sid})</b>{pts_label} {_safe(subq.get('question', ''))}",
            s["subq_label"],
        ))
        if is_key:
            items.append(Paragraph(_safe(subq.get("model_answer", "")), s["model_ans"]))
        else:
            for _ in range(3):
                items.append(HRFlowable(width=CONTENT_W, thickness=0.3, color=colors.lightgrey))
                items.append(Spacer(1, 0.3 * cm))

    return items


# ── Code Analysis block ───────────────────────────────────────────────────────

def _code_block(q: dict, s: dict, is_key: bool, ex_num: int) -> list:
    items = [Paragraph(
        f"<b>Exercice {ex_num}</b> — Analyse de Code"
        + (f" ({q.get('code_language', '')})" if q.get("code_language") else ""),
        s["exercise_h"],
    )]

    if q.get("context"):
        items.append(Paragraph(_safe(q["context"]), s["body"]))
        items.append(Spacer(1, 0.2 * cm))

    # Code rendered in a monospace table with grey background
    code_style = ParagraphStyle(
        "code_blk", fontName="Courier", fontSize=9, leading=12,
        leftIndent=0, rightIndent=0,
    )
    code_lines = (q.get("code") or "").split("\n")
    code_rows  = [[Paragraph(_safe(ln) or "&nbsp;", code_style)] for ln in code_lines]
    code_tbl   = Table(code_rows, colWidths=[CONTENT_W])
    code_tbl.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, -1), colors.HexColor("#f4f4f4")),
        ("BOX",           (0, 0), (-1, -1), 0.7, colors.HexColor("#bbbbbb")),
        ("TOPPADDING",    (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ("LEFTPADDING",   (0, 0), (-1, -1), 8),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 8),
    ]))
    items.append(code_tbl)
    items.append(Spacer(1, 0.3 * cm))

    for subq in q.get("subquestions", []):
        pts       = subq.get("points", "")
        sid       = subq.get("id", "")
        pts_label = f" ({pts} pts)" if pts else ""
        items.append(Paragraph(
            f"<b>{sid})</b>{pts_label} {_safe(subq.get('question', ''))}",
            s["subq_label"],
        ))
        if is_key:
            items.append(Paragraph(_safe(subq.get("model_answer", "")), s["model_ans"]))
        else:
            for _ in range(3):
                items.append(HRFlowable(width=CONTENT_W, thickness=0.3, color=colors.lightgrey))
                items.append(Spacer(1, 0.3 * cm))

    return items


# ── Story builder (ordered question list) ─────────────────────────────────────

def _build_story(questions: list, header: dict, s: dict, is_key: bool,
                 total_pages: int = 0) -> list:
    """
    Build a complete PDF story from an ORDERED list of question dicts.
    Each question becomes its own Exercice — order is exactly as given.
    Consecutive MCQs/TF questions are grouped into one Exercice.
    """
    hdr = dict(header)
    hdr["_total_pages"] = str(total_pages) if total_pages else ""

    story  = _header_flowables(hdr, s, is_key)
    ex_num = 1
    i      = 0

    while i < len(questions):
        q      = questions[i]
        q_type = q.get("type")

        # Group consecutive same-type MCQ / TF into one exercice
        if q_type in ("mcq", "truefalse"):
            group = [q]
            j     = i + 1
            while j < len(questions) and questions[j].get("type") == q_type:
                group.append(questions[j])
                j += 1
            if q_type == "mcq":
                story += _mcq_block(group, s, is_key, ex_num)
            else:
                story += _tf_block(group, s, is_key, ex_num)
            i = j
        elif q_type == "problem":
            story += _problem_block(q, s, is_key, ex_num)
            i += 1
        elif q_type == "casestudy":
            story += _casestudy_block(q, s, is_key, ex_num)
            i += 1
        elif q_type == "code":
            story += _code_block(q, s, is_key, ex_num)
            i += 1
        else:
            i += 1
            continue

        ex_num += 1
        story.append(Spacer(1, 0.3 * cm))

    return story


# ── Main entry point ──────────────────────────────────────────────────────────

def generate_pdfs(exam: dict, header: dict) -> tuple[bytes, bytes]:
    """Generate exam sheet + answer key. Returns (exam_bytes, key_bytes)."""
    s         = _make_styles()
    questions = exam.get("questions", [])

    def _build_bytes(is_key: bool, total_pages: int = 0) -> tuple[bytes, int]:
        buf  = io.BytesIO()
        doc  = _make_doc(buf)
        story = _build_story(questions, header, s, is_key, total_pages)
        doc.build(story)
        return buf.getvalue(), doc.page

    # Two-pass build so "Nombre de pages" reflects the real page count
    _, exam_pages = _build_bytes(False, 0)
    exam_bytes, _ = _build_bytes(False, exam_pages)

    _, key_pages  = _build_bytes(True, 0)
    key_bytes, _  = _build_bytes(True, key_pages)

    return exam_bytes, key_bytes


def generate_pdfs_b64(exam: dict, header: dict) -> dict:
    """Return both PDFs as base64 strings + suggested filenames."""
    exam_bytes, key_bytes = generate_pdfs(exam, header)
    topic   = exam.get("topic", "exam").replace(" ", "_").lower()
    subject = header.get("subject", "").replace(" ", "_").lower() or topic
    year    = header.get("academic_year", "2024-2025").replace("-", "_")
    return {
        "exam_pdf":      base64.b64encode(exam_bytes).decode(),
        "key_pdf":       base64.b64encode(key_bytes).decode(),
        "exam_filename": f"exam_{subject}_{year}.pdf",
        "key_filename":  f"corrige_{subject}_{year}.pdf",
    }
