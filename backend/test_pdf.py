import asyncio
from app.core.pdf import render_result_card_pdf

def main():
    try:
        pdf_bytes = render_result_card_pdf(
            student_name="Test Student",
            admission_number="1234",
            session_name="2025-2026",
            gregorian_date="2026-07-21",
            hijri_date="Muharram 1448 AH",
            course_rows=[["Math", "95", "A"]],
            overall_score="95",
            published=True
        )
        print("Success! PDF bytes length:", len(pdf_bytes))
    except Exception as e:
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()
