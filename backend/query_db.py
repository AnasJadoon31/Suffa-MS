import asyncio
from sqlalchemy import select
from app.db.session import SessionLocal
from app.modules.people.models import StudentProfile
from app.modules.assessments.models import ResultPublication

async def main():
    async with SessionLocal() as session:
        stmt = select(StudentProfile).where(StudentProfile.admission_number == "ADM-00476")
        student = (await session.execute(stmt)).scalar_one_or_none()
        if student:
            print(f"Student: {student.id}")
            stmt2 = select(ResultPublication).where(ResultPublication.student_id == student.id)
            pubs = (await session.execute(stmt2)).scalars().all()
            for p in pubs:
                print(f"Publication: session={p.session_id}")
            if not pubs:
                print("No publications found for this student.")
                
asyncio.run(main())
