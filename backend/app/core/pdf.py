import io
from pathlib import Path

import arabic_reshaper
from bidi.algorithm import get_display
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

FONTS_DIR = Path(__file__).resolve().parent.parent / "assets" / "fonts"
URDU_FONT = "NotoNastaliqUrdu"
URDU_FONT_BOLD = "NotoNastaliqUrdu-Bold"

_urdu_font_registered = False


def _ensure_urdu_font() -> None:
    global _urdu_font_registered
    if _urdu_font_registered:
        return
    pdfmetrics.registerFont(TTFont(URDU_FONT, str(FONTS_DIR / "NotoNastaliqUrdu-Regular.ttf")))
    pdfmetrics.registerFont(TTFont(URDU_FONT_BOLD, str(FONTS_DIR / "NotoNastaliqUrdu-Bold.ttf")))
    _urdu_font_registered = True


def shape_urdu(text: str) -> str:
    """Reorders/reshapes Urdu (Arabic-script) text into presentation form so it
    renders correctly in reportlab, which does not do BiDi/shaping itself."""
    return get_display(arabic_reshaper.reshape(text))


def render_table_pdf(title: str, subtitle: str, headers: list[str], rows: list[list[str]]) -> bytes:
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, title=title)
    styles = getSampleStyleSheet()

    elements = [
        Paragraph(title, styles["Title"]),
        Paragraph(subtitle, styles["Normal"]),
        Spacer(1, 16),
    ]

    table = Table([headers, *rows], repeatRows=1)
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1f2937")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f3f4f6")]),
            ]
        )
    )
    elements.append(table)
    doc.build(elements)
    return buffer.getvalue()


def render_result_card_pdf(
    *,
    student_name: str,
    admission_number: str,
    session_name: str,
    gregorian_date: str,
    hijri_date: str,
    course_rows: list[list[str]],
    overall_score: str,
    published: bool,
) -> bytes:
    _ensure_urdu_font()
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, title=f"Result card — {student_name}")
    styles = getSampleStyleSheet()
    urdu_style = ParagraphStyle("urdu", fontName=URDU_FONT, fontSize=13, alignment=2, leading=20)
    urdu_title_style = ParagraphStyle("urduTitle", fontName=URDU_FONT_BOLD, fontSize=16, alignment=2, leading=24)

    elements = [
        Paragraph("Result Card", styles["Title"]),
        Paragraph(shape_urdu("نتائج کارڈ"), urdu_title_style),
        Spacer(1, 10),
        Paragraph(f"Student: {student_name} ({admission_number})", styles["Normal"]),
        Paragraph(shape_urdu(f"طالب علم: {student_name}"), urdu_style),
        Paragraph(f"Session: {session_name}", styles["Normal"]),
        Paragraph(f"Date: {gregorian_date} ({hijri_date})", styles["Normal"]),
        Spacer(1, 16),
    ]

    headers = ["Course", "Score", "Band"]
    table = Table([headers, *course_rows], repeatRows=1)
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1f2937")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTSIZE", (0, 0), (-1, -1), 10),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f3f4f6")]),
            ]
        )
    )
    elements.append(table)
    elements.append(Spacer(1, 16))
    elements.append(Paragraph(f"Overall score: {overall_score}", styles["Heading3"]))
    elements.append(Paragraph(shape_urdu(f"مجموعی نمبر: {overall_score}"), urdu_style))
    if not published:
        elements.append(Spacer(1, 10))
        elements.append(Paragraph("(Draft — not yet published)", styles["Italic"]))

    doc.build(elements)
    return buffer.getvalue()
