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

    # Logo sits ABOVE the bordered table, left-aligned (matches real TEK-UP layout)
    if os.path.exists(_LOGO):
        logo = Image(_LOGO, width=4.0 * cm, height=2.6 * cm, kind="proportional")
        logo.hAlign = "LEFT"
        items.append(logo)
        items.append(Spacer(1, 0.15 * cm))

    # ── Bordered info table ────────────────────────────────────────────────────
    title_style = ParagraphStyle(
        "tbl_title", fontName="Helvetica-Bold", fontSize=13,
        alignment=TA_CENTER, leading=17,
    )
    title_txt = "<b>Ecole Supérieure Privée Technologies &amp; Ingénierie</b>"
    if is_key:
        title_txt += "<br/><font color='#cc0000'>— CORRIGÉ —</font>"

    def B(text):
        return Paragraph(f"<b>{text}</b>", s["hdr_val"])

    def V(text):
        return Paragraph(f":&nbsp;&nbsp;&nbsp;{text or ''}", s["hdr_val"])

    def E():
        return Paragraph("", s["hdr_val"])

    year = header.get("academic_year", "2024-2025")
    sem  = header.get("semester", "1")
    date = header.get("date", "")
    dur  = header.get("duration", "")

    # 3 columns: [label (c1) | colon+value (c2) | extra (c3)]
    c1 = 4.8 * cm
    c3 = 3.2 * cm
    c2 = CONTENT_W - c1 - c3

    rows = [
        # Row 0 — school title, spans all 3 cols
        [Paragraph(title_txt, title_style), E(), E()],
        # Row 1 — Type d'épreuve with ■ indicator
        [B("Type d'épreuve"), V(header.get("exam_type", "Devoir")),
         Paragraph("<font size='14'>■</font>", s["hdr_val"])],
        # Row 2-9 — regular rows (col2+col3 merged via SPAN)
        [B("Enseignant"),        V(header.get("teacher", "")),            E()],
        [B("Matière"),           V(header.get("subject", header.get("topic", ""))), E()],
        [B("Année Universitaire"),
         Paragraph(f":&nbsp;&nbsp;&nbsp;{year}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"
                   f"<b>Semestre</b>&nbsp;&nbsp;:&nbsp;&nbsp;{sem}", s["hdr_val"]), E()],
        [B("Classe"),            V(header.get("class_name", "")),         E()],
        [B("Documents"),         V(header.get("documents", "Non autorisés")), E()],
        [B("Date"),
         Paragraph(f":&nbsp;&nbsp;&nbsp;{date}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"
                   f"<b>Durée :</b>&nbsp;&nbsp;{dur}", s["hdr_val"]), E()],
        [B("Nombre de pages"),   V(""),                                   E()],
        [B("Barème"),            V(header.get("bareme", "")),              E()],
    ]

    tbl_style = [
        ("BOX",          (0, 0), (-1, -1), 1.3, colors.black),
        ("LINEBELOW",    (0, 0), (-1,  0), 1.0, colors.black),   # below title
        ("LINEBELOW",    (0, 1), (-1, -2), 0.5, colors.black),   # between info rows
        ("VALIGN",       (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN",        (0, 0), (-1,  0), "CENTER"),             # title centered
        ("TOPPADDING",   (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING",(0, 0), (-1, -1), 4),
        ("LEFTPADDING",  (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        # Title spans all 3 cols
        ("SPAN",         (0, 0), (2,  0)),
        # Rows 2-9: merge col1+col2 (index 1 and 2)
        ("SPAN",         (1, 2), (2,  2)),
        ("SPAN",         (1, 3), (2,  3)),
        ("SPAN",         (1, 4), (2,  4)),
        ("SPAN",         (1, 5), (2,  5)),
        ("SPAN",         (1, 6), (2,  6)),
        ("SPAN",         (1, 7), (2,  7)),
        ("SPAN",         (1, 8), (2,  8)),
        ("SPAN",         (1, 9), (2,  9)),
    ]

    tbl = Table(rows, colWidths=[c1, c2, c3])
    tbl.setStyle(TableStyle(tbl_style))
    items.append(tbl)
    items.append(Spacer(1, 0.5 * cm))
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


# ── Main entry point ──────────────────────────────────────────────────────────

def generate_pdfs(exam: dict, header: dict) -> tuple[bytes, bytes]:
    """
    Generate exam sheet + answer key.
    Returns (exam_bytes, key_bytes).
    """
    s = _make_styles()

    def build(is_key: bool) -> bytes:
        buf = io.BytesIO()
        doc = _make_doc(buf)
        story = []

        # Header
        story += _header_flowables(header, s, is_key)

        # Group questions by type, preserving order
        questions = exam.get("questions", [])
        mcq_qs  = [q for q in questions if q.get("type") == "mcq"]
        tf_qs   = [q for q in questions if q.get("type") == "truefalse"]
        prob_qs = [q for q in questions if q.get("type") == "problem"]
        case_qs = [q for q in questions if q.get("type") == "casestudy"]

        ex_num = 1

        if mcq_qs:
            story += _mcq_block(mcq_qs, s, is_key, ex_num)
            ex_num += 1
            story.append(Spacer(1, 0.3 * cm))

        if tf_qs:
            story += _tf_block(tf_qs, s, is_key, ex_num)
            ex_num += 1
            story.append(Spacer(1, 0.3 * cm))

        for pq in prob_qs:
            story += _problem_block(pq, s, is_key, ex_num)
            ex_num += 1
            story.append(Spacer(1, 0.3 * cm))

        for cq in case_qs:
            story += _casestudy_block(cq, s, is_key, ex_num)
            ex_num += 1
            story.append(Spacer(1, 0.3 * cm))

        doc.build(story)
        return buf.getvalue()

    return build(False), build(True)


def generate_pdfs_b64(exam: dict, header: dict) -> dict:
    """Return both PDFs as base64 strings + suggested filename."""
    exam_bytes, key_bytes = generate_pdfs(exam, header)
    topic   = exam.get("topic", "exam").replace(" ", "_").lower()
    subject = header.get("subject", "").replace(" ", "_").lower() or topic
    year    = header.get("academic_year", "2024-2025").replace("-", "_")
    return {
        "exam_pdf": base64.b64encode(exam_bytes).decode(),
        "key_pdf":  base64.b64encode(key_bytes).decode(),
        "exam_filename": f"exam_{subject}_{year}.pdf",
        "key_filename":  f"corrige_{subject}_{year}.pdf",
    }
