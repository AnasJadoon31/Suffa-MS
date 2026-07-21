import io
from dataclasses import dataclass
from pathlib import Path
from xml.sax.saxutils import escape

import arabic_reshaper
from bidi.algorithm import get_display
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Image as ReportImage, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


@dataclass(frozen=True)
class ReportBranding:
    name_en: str
    name_ur: str
    address: str = ""
    phone: str = ""
    email: str = ""
    website: str = ""
    logo_bytes: bytes | None = None


def _branding_header(branding: ReportBranding, styles, *, name_style: str = "Heading1", language: str | None = None) -> list:
    _ensure_urdu_font()
    elements = []
    if branding.logo_bytes:
        logo = ReportImage(io.BytesIO(branding.logo_bytes), width=54, height=54, kind="proportional")
        logo.hAlign = "CENTER"
        elements.append(logo)
    if language == "ur":
        name = branding.name_ur or branding.name_en
        elements.append(Paragraph(f'<font name="{URDU_FONT_BOLD}">{shape_urdu(name)}</font>', styles[name_style]))
    elif language == "en":
        elements.append(Paragraph(escape(branding.name_en or branding.name_ur), styles[name_style]))
    else:
        elements.append(Paragraph(escape(branding.name_en or branding.name_ur), styles[name_style]))
        if branding.name_ur and branding.name_ur != branding.name_en:
            urdu_name_style = ParagraphStyle("BrandUrdu", fontName=URDU_FONT_BOLD, fontSize=14, leading=18)
            elements.append(Paragraph(shape_urdu(branding.name_ur), urdu_name_style))
    contact = " · ".join(filter(None, [branding.address, branding.phone, branding.email, branding.website]))
    if contact:
        elements.append(Paragraph(escape(contact), styles["Normal"]))
    elements.append(Spacer(1, 10))
    return elements


async def load_report_branding(session, madrasa) -> ReportBranding:
    from sqlalchemy import select

    from app.core.storage import download_object_bytes
    from app.modules.operations.models import MadrasaSetting

    rows = (
        await session.execute(
            select(MadrasaSetting.key, MadrasaSetting.value).where(
                MadrasaSetting.madrasa_id == madrasa.id,
                MadrasaSetting.key.in_([
                    "madrasa.address", "madrasa.phone", "madrasa.email",
                    "madrasa.website", "madrasa.logo_file_id",
                    "madrasa.name_en", "madrasa.name_ur",
                ]),
            )
        )
    ).all()
    values = {key: value for key, value in rows}
    logo_bytes = None
    logo_key = values.get("madrasa.logo_file_id")
    if logo_key:
        try:
            logo_bytes = download_object_bytes(logo_key)
        except Exception:
            logo_bytes = None
    return ReportBranding(
        name_en=values.get("madrasa.name_en") or madrasa.name,
        name_ur=values.get("madrasa.name_ur") or madrasa.name,
        address=values.get("madrasa.address", ""),
        phone=values.get("madrasa.phone", ""),
        email=values.get("madrasa.email", ""),
        website=values.get("madrasa.website", ""),
        logo_bytes=logo_bytes,
    )

FONTS_DIR = Path(__file__).resolve().parent.parent / "assets" / "fonts"
URDU_FONT = "NotoNaskhArabic"
URDU_FONT_BOLD = "NotoNaskhArabic-Bold"

_urdu_font_registered = False


def _ensure_urdu_font() -> None:
    global _urdu_font_registered
    if _urdu_font_registered:
        return
    # reportlab has no OpenType shaping engine — it just does a straight cmap
    # glyph lookup per character. Nastaliq fonts rely entirely on GSUB
    # substitution and carry ~no legacy Presentation-Forms glyphs, so nearly
    # every character `arabic_reshaper` produces comes up missing. Naskh
    # fonts still ship full Presentation-Forms coverage, so it's the one
    # that actually renders here (browsers doing real shaping are a
    # different story — Nastaliq is fine there, see app/public/fonts).
    pdfmetrics.registerFont(TTFont(URDU_FONT, str(FONTS_DIR / "NotoNaskhArabic-Regular.ttf")))
    pdfmetrics.registerFont(TTFont(URDU_FONT_BOLD, str(FONTS_DIR / "NotoNaskhArabic-Bold.ttf")))
    _urdu_font_registered = True


def shape_urdu(text: str) -> str:
    """Reorders/reshapes Urdu (Arabic-script) text into presentation form so it
    renders correctly in reportlab, which does not do BiDi/shaping itself."""
    return get_display(arabic_reshaper.reshape(text))


def _contains_arabic(text: str) -> bool:
    return any("\u0600" <= char <= "\u06ff" or "\u0750" <= char <= "\u077f" for char in text)


def _page_number_callback(page_size, language: str):
    is_urdu = language == "ur"

    def draw(canvas, document) -> None:
        canvas.saveState()
        canvas.setFillColor(colors.HexColor("#667085"))
        if is_urdu:
            canvas.setFont(URDU_FONT, 8)
            canvas.drawRightString(
                page_size[0] - document.rightMargin, 18,
                f"{document.page} {shape_urdu('صفحہ')}",
            )
        else:
            canvas.setFont("Helvetica", 8)
            canvas.drawRightString(page_size[0] - document.rightMargin, 18, f"Page {document.page}")
        canvas.restoreState()

    return draw


def bilingual_line(urdu_label: str, value: str, *, bold: bool = False) -> str:
    """`value: label` markup for a right-aligned line mixing a Latin/numeric
    value with an Urdu label. The Urdu font here (NotoNaskhArabic) has no
    Latin glyphs at all, and reportlab does no font-fallback, so the Latin
    value must run in the default font and only the Urdu label gets the
    Urdu font tag — a single font for the whole string silently drops
    whichever script it doesn't cover."""
    font = URDU_FONT_BOLD if bold else URDU_FONT
    shaped_label = shape_urdu(f"{urdu_label}:")
    return f'{escape(value)} <font name="{font}">{shaped_label}</font>'


def render_table_pdf(
    title: str,
    subtitle: str,
    headers: list[str],
    rows: list[list[str]],
    branding: ReportBranding | None = None,
    *,
    language: str = "en",
) -> bytes:
    """Wide grids (timetables, result matrices) were overflowing the page:
    a plain reportlab Table auto-sizes columns to fit its content, and with
    many columns of unwrapped multi-line text (course + teacher names) the
    table simply grew wider than the page, clipping whatever fell outside
    the frame. Fixed by wrapping every cell in a Paragraph (so text wraps
    within its column instead of forcing the table wider) and computing
    explicit colWidths that always sum to the printable width, with
    landscape orientation once there are enough columns that portrait would
    squeeze them unreadably thin."""
    from reportlab.lib.pagesizes import landscape as landscape_pagesize

    buffer = io.BytesIO()
    page_size = landscape_pagesize(A4) if len(headers) > 5 else A4
    doc = SimpleDocTemplate(buffer, pagesize=page_size, title=title, topMargin=36, bottomMargin=36, leftMargin=36, rightMargin=36)
    styles = getSampleStyleSheet()
    _ensure_urdu_font()
    is_urdu = language == "ur"
    alignment = 2 if is_urdu else 0
    cell_style = ParagraphStyle("cell", fontName="Helvetica", fontSize=8, leading=11, alignment=alignment)
    header_style = ParagraphStyle("cellHeader", parent=cell_style, textColor=colors.white, fontName="Helvetica-Bold")
    section_style = ParagraphStyle("cellSection", parent=cell_style, fontName="Helvetica-Bold")
    title_style = ParagraphStyle(
        "reportTitle",
        parent=styles["Title"],
        fontName=URDU_FONT_BOLD if is_urdu else "Helvetica-Bold",
        alignment=2 if is_urdu else 0,
        leading=24,
    )
    subtitle_style = ParagraphStyle(
        "reportSubtitle",
        parent=styles["Normal"],
        fontName=URDU_FONT if is_urdu and _contains_arabic(subtitle) else "Helvetica",
        alignment=2 if is_urdu else 0,
        leading=16,
    )

    elements = []
    if branding:
        elements.extend(_branding_header(branding, styles, language=language))
    elements.extend([
        Paragraph(shape_urdu(title) if is_urdu else escape(title), title_style),
        Paragraph(shape_urdu(subtitle) if is_urdu and _contains_arabic(subtitle) else escape(subtitle), subtitle_style),
        Spacer(1, 16),
    ])

    # Rows produced by callers use a "— label —" marker in the first cell for
    # group/section separators (one weekly grid per section, one block per
    # class in a results export, etc) — span those across the full row width
    # instead of rendering them as a mostly-empty data row.
    section_row_indices = {i for i, row in enumerate(rows) if row and str(row[0]).startswith("— ")}

    def _cell(value: object, *, is_header: bool = False, is_section: bool = False) -> Paragraph:
        style = header_style if is_header else (section_style if is_section else cell_style)
        raw_text = str(value)
        if is_urdu and _contains_arabic(raw_text):
            font = URDU_FONT_BOLD if is_header or is_section else URDU_FONT
            text = f'<font name="{font}">{shape_urdu(raw_text)}</font>'
        else:
            text = escape(raw_text).replace("\n", "<br/>")
        return Paragraph(text, style)

    table_data = [[_cell(h, is_header=True) for h in headers]]
    for i, row in enumerate(rows):
        is_section = i in section_row_indices
        table_data.append([_cell(v, is_section=is_section) for v in row])

    usable_width = page_size[0] - doc.leftMargin - doc.rightMargin
    first_col_width = max(usable_width * 0.16, 60)
    other_col_width = (usable_width - first_col_width) / max(len(headers) - 1, 1)
    col_widths = [first_col_width] + [other_col_width] * (len(headers) - 1)

    style_commands = [
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1f2937")),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f3f4f6")]),
    ]
    for row_index in section_row_indices:
        table_row = row_index + 1  # +1 for the header row
        style_commands.append(("SPAN", (0, table_row), (-1, table_row)))
        style_commands.append(("BACKGROUND", (0, table_row), (-1, table_row), colors.HexColor("#e5e7eb")))

    table = Table(table_data, colWidths=col_widths, repeatRows=1)
    table.setStyle(TableStyle(style_commands))
    elements.append(table)
    draw_page_number = _page_number_callback(page_size, language)
    doc.build(elements, onFirstPage=draw_page_number, onLaterPages=draw_page_number)
    return buffer.getvalue()


def render_receipt_pdf(
    *,
    madrasa_name: str,
    receipt_kind: str,  # "Contribution" | "Donation"
    receipt_number: str,
    payer_name: str,
    category_name: str,
    amount: str,
    currency: str,
    payment_date: str,
    hijri_date: str,
    recorded_by: str,
    note: str | None = None,
    branding: ReportBranding | None = None,
) -> bytes:
    _ensure_urdu_font()
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, title=f"{receipt_kind} receipt {receipt_number}")
    styles = getSampleStyleSheet()
    urdu_title_style = ParagraphStyle("urduTitle", fontName=URDU_FONT_BOLD, fontSize=15, alignment=2, leading=22)

    elements = []
    if branding:
        elements.extend(_branding_header(branding, styles, name_style="Title"))
    else:
        elements.append(Paragraph(escape(madrasa_name), styles["Title"]))
    elements.extend([
        Paragraph(f"{receipt_kind} Receipt", styles["Heading2"]),
        Paragraph(f'<font name="{URDU_FONT_BOLD}">{shape_urdu("رسید")}</font>', urdu_title_style),
        Spacer(1, 12),
    ])

    detail_rows = [
        ["Receipt #", receipt_number],
        ["Received from", payer_name],
        ["Category / purpose", category_name],
        ["Amount", f"{amount} {currency}"],
        ["Date", f"{payment_date} ({hijri_date})"],
        ["Recorded by", recorded_by],
    ]
    if note:
        detail_rows.append(["Note", note])

    table = Table(detail_rows, colWidths=[140, 320])
    table.setStyle(
        TableStyle(
            [
                ("FONTSIZE", (0, 0), (-1, -1), 10),
                ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
                ("ROWBACKGROUNDS", (0, 0), (-1, -1), [colors.white, colors.HexColor("#f3f4f6")]),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]
        )
    )
    elements.append(table)
    elements.append(Spacer(1, 24))
    elements.append(Paragraph("This is a system-generated receipt.", styles["Italic"]))

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
    branding: ReportBranding | None = None,
    language: str = "en",
) -> bytes:
    _ensure_urdu_font()
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, title=f"Result card — {student_name}")
    styles = getSampleStyleSheet()
    urdu_style = ParagraphStyle("urdu", fontName=URDU_FONT, fontSize=12, alignment=2, leading=16)
    urdu_center_style = ParagraphStyle("urduCenter", fontName=URDU_FONT_BOLD, fontSize=16, alignment=1, leading=20)
    center_style = ParagraphStyle("Center", parent=styles["Normal"], alignment=1)
    header_style = ParagraphStyle("TableHeader", parent=styles["Normal"], textColor=colors.white, alignment=1, fontSize=11, leading=14)

    elements = []
    is_urdu = language == "ur"
    if branding:
        elements.extend(_branding_header(branding, styles, language=language))
    
    # Title
    title = (
        Paragraph(shape_urdu("نتائج کارڈ"), urdu_center_style)
        if is_urdu else Paragraph("<b>Result Card</b>", styles["Title"])
    )
    elements.extend([
        title,
        Spacer(1, 16),
    ])

    # Metadata Grid
    if is_urdu:
        info_table_data = [
            [Paragraph(bilingual_line("طالب علم", f"{student_name} ({admission_number})"), urdu_style)],
            [Paragraph(bilingual_line("تعلیمی سال", session_name), urdu_style)],
            [Paragraph(bilingual_line("تاریخ", f"{gregorian_date} ({hijri_date})"), urdu_style)],
        ]
    else:
        info_table_data = [
            [Paragraph(f"<b>Student:</b> {escape(student_name)} ({escape(admission_number)})", styles["Normal"])],
            [Paragraph(f"<b>Session:</b> {escape(session_name)}", styles["Normal"])],
            [Paragraph(f"<b>Date:</b> {gregorian_date} ({hijri_date})", styles["Normal"])],
        ]
    info_table = Table(info_table_data, colWidths=[520])
    info_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    elements.append(info_table)
    elements.append(Spacer(1, 16))

    # Course Table
    header_labels = ["مضمون", "نمبر", "درجہ"] if is_urdu else ["Course", "Score", "Band"]
    headers = [Paragraph(
        f'<font name="{URDU_FONT_BOLD}">{shape_urdu(label)}</font>' if is_urdu else label,
        header_style,
    ) for label in header_labels]
    
    # Center align course rows
    formatted_course_rows = []
    for row in course_rows:
        formatted_course_rows.append([
            Paragraph(
                f'<font name="{URDU_FONT}">{shape_urdu(row[0])}</font>'
                if is_urdu and _contains_arabic(row[0]) else escape(row[0]),
                center_style,
            ),
            Paragraph(escape(row[1]), center_style),
            Paragraph(escape(row[2]), center_style),
        ])

    table = Table([headers, *formatted_course_rows], repeatRows=1, colWidths=[200, 160, 160])
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1f2937")),
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f3f4f6")]),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    elements.append(table)
    elements.append(Spacer(1, 20))

    # Overall Score
    score_content = (
        Paragraph(bilingual_line("مجموعی نمبر", overall_score, bold=True), urdu_style)
        if is_urdu else Paragraph(f"<b>Overall score:</b> {escape(overall_score)}", styles["Normal"])
    )
    score_table = Table([[score_content]], colWidths=[520])
    score_table.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE")]))
    elements.append(score_table)
    
    if not published:
        elements.append(Spacer(1, 10))
        draft = shape_urdu("مسودہ — ابھی شائع نہیں ہوا") if is_urdu else "(Draft — not yet published)"
        elements.append(Paragraph(draft, urdu_style if is_urdu else styles["Italic"]))

    # Signatures
    elements.append(Spacer(1, 60))
    sig_table = Table(
        [
            [
                Paragraph(f'______________________<br/><br/>Principal / <font name="{URDU_FONT}">{shape_urdu("پرنسپل")}</font>', center_style),
                "",
                Paragraph(f'______________________<br/><br/>Class Teacher / <font name="{URDU_FONT}">{shape_urdu("کلاس ٹیچر")}</font>', center_style),
            ]
        ],
        colWidths=[200, 120, 200]
    )
    sig_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    elements.append(sig_table)

    draw_page_number = _page_number_callback(A4, language)
    doc.build(elements, onFirstPage=draw_page_number, onLaterPages=draw_page_number)
    return buffer.getvalue()
