"""Generate deterministic report pages for visual-regression review."""

from pathlib import Path

from app.core.pdf import ReportBranding, render_table_pdf


ARTIFACTS = Path(__file__).parents[2] / "app" / "artifacts" / "issue-verification"
BRANDING = ReportBranding(
    name_en="Suffa Madrasa",
    name_ur="صفہ مدرسہ",
    address="Karachi, Pakistan",
    phone="+92 300 1234567",
    email="office@suffa.example",
)


def main() -> None:
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    english = render_table_pdf(
        "Student result report",
        "Academic session 2026–27 · Hifz Level 1 / A",
        ["Student", "Quran", "Tajweed", "Assignments", "Total", "Grade"],
        [["Ali Noor", "88", "91", "9", "188 / 200", "A"]] * 24,
        BRANDING,
        language="en",
    )
    urdu = render_table_pdf(
        "طلبہ کا نتیجہ",
        "تعلیمی سال ۲۰۲۶–۲۷ · حفظ درجہ اول / الف",
        ["طالب علم", "قرآن", "تجوید", "اسائنمنٹ", "کل نمبر", "گریڈ"],
        [["علی نور", "۸۸", "۹۱", "۹", "۱۸۸ / ۲۰۰", "اے"]] * 24,
        BRANDING,
        language="ur",
    )
    (ARTIFACTS / "result-report-en.pdf").write_bytes(english)
    (ARTIFACTS / "result-report-ur.pdf").write_bytes(urdu)


if __name__ == "__main__":
    main()
