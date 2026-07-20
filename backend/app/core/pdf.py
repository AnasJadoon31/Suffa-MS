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
    name: str
    address: str = ""
    phone: str = ""
    email: str = ""
    website: str = ""
    logo_bytes: bytes | None = None


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
        name=madrasa.name,
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
    cell_style = ParagraphStyle("cell", fontName="Helvetica", fontSize=8, leading=10)
    header_style = ParagraphStyle("cellHeader", parent=cell_style, textColor=colors.white, fontName="Helvetica-Bold")
    section_style = ParagraphStyle("cellSection", parent=cell_style, fontName="Helvetica-Bold")

    elements = []
    if branding:
        if branding.logo_bytes:
            logo = ReportImage(io.BytesIO(branding.logo_bytes), width=54, height=54, kind="proportional")
            logo.hAlign = "CENTER"
            elements.append(logo)
        elements.append(Paragraph(escape(branding.name), styles["Heading1"]))
        contact = " · ".join(filter(None, [branding.address, branding.phone, branding.email, branding.website]))
        if contact:
            elements.append(Paragraph(escape(contact), styles["Normal"]))
        elements.append(Spacer(1, 10))
    elements.extend([
        Paragraph(escape(title), styles["Title"]),
        Paragraph(escape(subtitle), styles["Normal"]),
        Spacer(1, 16),
    ])

    # Rows produced by callers use a "— label —" marker in the first cell for
    # group/section separators (one weekly grid per section, one block per
    # class in a results export, etc) — span those across the full row width
    # instead of rendering them as a mostly-empty data row.
    section_row_indices = {i for i, row in enumerate(rows) if row and str(row[0]).startswith("— ")}

    def _cell(value: object, *, is_header: bool = False, is_section: bool = False) -> Paragraph:
        style = header_style if is_header else (section_style if is_section else cell_style)
        text = escape(str(value)).replace("\n", "<br/>")
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
    doc.build(elements)
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
    if branding and branding.logo_bytes:
        logo = ReportImage(io.BytesIO(branding.logo_bytes), width=54, height=54, kind="proportional")
        logo.hAlign = "CENTER"
        elements.append(logo)
    elements.extend([
        Paragraph(escape(branding.name if branding else madrasa_name), styles["Title"]),
        *([Paragraph(escape(" · ".join(filter(None, [branding.address, branding.phone, branding.email, branding.website]))), styles["Normal"])] if branding and any([branding.address, branding.phone, branding.email, branding.website]) else []),
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
) -> bytes:
    _ensure_urdu_font()
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, title=f"Result card — {student_name}")
    styles = getSampleStyleSheet()
    urdu_style = ParagraphStyle("urdu", fontName="Helvetica", fontSize=13, alignment=2, leading=20)
    urdu_title_style = ParagraphStyle("urduTitle", fontName=URDU_FONT_BOLD, fontSize=16, alignment=2, leading=24)

    elements = []
    if branding:
        if branding.logo_bytes:
            logo = ReportImage(io.BytesIO(branding.logo_bytes), width=54, height=54, kind="proportional")
            logo.hAlign = "CENTER"
            elements.append(logo)
        elements.append(Paragraph(escape(branding.name), styles["Heading1"]))
        contact = " · ".join(filter(None, [branding.address, branding.phone, branding.email, branding.website]))
        if contact:
            elements.append(Paragraph(escape(contact), styles["Normal"]))
        elements.append(Spacer(1, 10))
    elements.extend([
        Paragraph("Result Card", styles["Title"]),
        Paragraph(f'<font name="{URDU_FONT_BOLD}">{shape_urdu("نتائج کارڈ")}</font>', urdu_title_style),
        Spacer(1, 10),
        Paragraph(f"Student: {escape(student_name)} ({escape(admission_number)})", styles["Normal"]),
        Paragraph(bilingual_line("طالب علم", student_name), urdu_style),
        Paragraph(f"Session: {escape(session_name)}", styles["Normal"]),
        Paragraph(f"Date: {gregorian_date} ({hijri_date})", styles["Normal"]),
        Spacer(1, 16),
    ])

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
    elements.append(Paragraph(f"Overall score: {escape(overall_score)}", styles["Heading3"]))
    elements.append(Paragraph(bilingual_line("مجموعی نمبر", overall_score), urdu_style))
    if not published:
        elements.append(Spacer(1, 10))
        elements.append(Paragraph("(Draft — not yet published)", styles["Italic"]))

    doc.build(elements)
    return buffer.getvalue()
