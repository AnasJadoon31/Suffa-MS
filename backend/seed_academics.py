import asyncio
from uuid import uuid4
from datetime import date
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy import select

from dotenv import load_dotenv
load_dotenv()

from app.core.config import settings
from app.modules.academics.models import Madrasa, AcademicSession
from app.modules.people.models import StudentProfile
from app.modules.auth.models import User

async def seed_academics():
    engine = create_async_engine(settings.database_url)
    SessionLocal = async_sessionmaker(engine, expire_on_commit=False)
    
    async with SessionLocal() as session:
        # Get the first madrasa
        stmt = select(Madrasa).limit(1)
        result = await session.execute(stmt)
        madrasa = result.scalar_one_or_none()
        if not madrasa:
            print("No madrasa found. Run seed.py first.")
            return

        madrasa_id = madrasa.id

        # Create an AcademicSession
        acad_session = AcademicSession(
            id=uuid4(),
            madrasa_id=madrasa_id,
            name="1448 / 2026",
            gregorian_start=date(2026, 6, 1),
            gregorian_end=date(2027, 5, 31),
            hijri_span="1448",
            is_active=True
        )
        session.add(acad_session)

        # Create Users
        u1 = User(id=uuid4(), madrasa_id=madrasa_id, username="stu1", password_hash="hash", role="student")
        u2 = User(id=uuid4(), madrasa_id=madrasa_id, username="stu2", password_hash="hash", role="student")
        u3 = User(id=uuid4(), madrasa_id=madrasa_id, username="stu3", password_hash="hash", role="student")
        u4 = User(id=uuid4(), madrasa_id=madrasa_id, username="stu4", password_hash="hash", role="student")
        session.add_all([u1, u2, u3, u4])

        # Create students
        student1 = StudentProfile(
            id=uuid4(),
            user_id=u1.id,
            madrasa_id=madrasa_id,
            admission_number="ADM-0001",
            name="Ahmad Ali",
            date_of_birth=date(2015, 1, 1),
            status="active"
        )
        student2 = StudentProfile(
            id=uuid4(),
            user_id=u2.id,
            madrasa_id=madrasa_id,
            admission_number="ADM-0002",
            name="Hamza Khan",
            date_of_birth=date(2015, 2, 1),
            status="active"
        )
        student3 = StudentProfile(
            id=uuid4(),
            user_id=u3.id,
            madrasa_id=madrasa_id,
            admission_number="ADM-0003",
            name="Bilal Usman",
            date_of_birth=date(2015, 3, 1),
            status="active"
        )
        student4 = StudentProfile(
            id=uuid4(),
            user_id=u4.id,
            madrasa_id=madrasa_id,
            admission_number="ADM-0004",
            name="Saad Noor",
            date_of_birth=date(2015, 4, 1),
            status="active"
        )
        session.add_all([student1, student2, student3, student4])
        
        await session.commit()
        
        print("--- ACADEMIC SEED DATA ---")
        print(f"SESSION_ID={acad_session.id}")
        print(f"STU1_ID={student1.id}")
        print(f"STU2_ID={student2.id}")
        print(f"STU3_ID={student3.id}")
        print(f"STU4_ID={student4.id}")

if __name__ == "__main__":
    asyncio.run(seed_academics())
