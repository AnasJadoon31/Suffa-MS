import asyncio
import os
from datetime import date
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from dotenv import load_dotenv

load_dotenv()

from app.core.config import settings
from app.core.security import hash_password
from app.db import core_models  # type: ignore
from app.modules.academics.models import (
    AcademicClass,
    AcademicSession,
    ClassCourse,
    Course,
    Enrollment,
    Madrasa,
    Program,
    Section,
)
from app.modules.auth.models import User, UserPermission, UserRole, UserStatus
from app.modules.people.models import StudentProfile, TeacherProfile
from app.modules.operations.models import TimetableSlot
from app.modules.messaging.models import MessageTemplate

# Default templates from bootstrap
DEFAULT_TEMPLATES = [
    {
        "code": "performance_report",
        "name": "Performance report",
        "content": {
            "en": "Assalamu Alaikum {guardian_name},\nResult for {student_name} ({class_name}), {session}:\n{summary_line}\nFull result card: {result_link}\n— {madrasa_name}",
            "ur": "السلام علیکم {guardian_name}،\n{student_name} ({class_name}) کا نتیجہ، {session}:\n{summary_line}\nمکمل نتیجہ کارڈ: {result_link}\n— {madrasa_name}",
        },
    },
    {
        "code": "credentials",
        "name": "Login credentials",
        "content": {
            "en": "Assalamu Alaikum,\nPortal access for {student_name}.\nUsername: {username}\nSet your password (valid 24h): {setup_link}\n— {madrasa_name}",
            "ur": "السلام علیکم،\n{student_name} کے پورٹل تک رسائی۔\nصارف نام: {username}\nاپنا پاس ورڈ مقرر کریں (24 گھنٹے کارآمد): {setup_link}\n— {madrasa_name}",
        },
    },
    {
        "code": "receipt",
        "name": "Payment/donation receipt",
        "content": {
            "en": "Assalamu Alaikum {payer_name},\nReceipt {receipt_no}: {amount} received for {category} on {date}.\nJazakAllah khair.\n— {madrasa_name}",
            "ur": "السلام علیکم {payer_name}،\nرسید {receipt_no}: {category} کی مد میں {amount} موصول ہوئے ({date})۔\nجزاک اللہ خیر۔\n— {madrasa_name}",
        },
    },
]

async def seed_all():
    engine = create_async_engine(settings.database_url)
    SessionLocal = async_sessionmaker(engine, expire_on_commit=False)

    async with SessionLocal() as db:
        tenant_slug = settings.default_tenant
        tenant_name = os.getenv("MADRASA_NAME", tenant_slug.title())

        madrasa = Madrasa(name=tenant_name, slug=tenant_slug, content_language="ur")
        db.add(madrasa)
        await db.flush()
        mid = madrasa.id

        # Templates
        for template in DEFAULT_TEMPLATES:
            db.add(MessageTemplate(madrasa_id=mid, **template))
        await db.flush()

        # Academics
        program = Program(madrasa_id=mid, name="Hifz")
        db.add(program)
        await db.flush()

        class_a = AcademicClass(madrasa_id=mid, program_id=program.id, name="Class 1")
        class_b = AcademicClass(madrasa_id=mid, program_id=program.id, name="Class 2")
        db.add_all([class_a, class_b])
        await db.flush()

        sec_a1 = Section(madrasa_id=mid, class_id=class_a.id, name="Alif")
        sec_a2 = Section(madrasa_id=mid, class_id=class_a.id, name="Bay")
        sec_b1 = Section(madrasa_id=mid, class_id=class_b.id, name="Alif")
        sec_b2 = Section(madrasa_id=mid, class_id=class_b.id, name="Bay")
        db.add_all([sec_a1, sec_a2, sec_b1, sec_b2])
        await db.flush()

        course = Course(madrasa_id=mid, name="Nazra")
        db.add(course)
        await db.flush()
        
        db.add_all([
            ClassCourse(madrasa_id=mid, class_id=class_a.id, course_id=course.id),
            ClassCourse(madrasa_id=mid, class_id=class_b.id, course_id=course.id),
        ])

        # Users
        admin_pass = await hash_password(os.getenv("BOOTSTRAP_ADMIN_PASSWORD", "password"))
        teacher_pass = await hash_password("password")
        
        principal = User(
            madrasa_id=mid, username=os.getenv("BOOTSTRAP_ADMIN_USERNAME", "admin"), 
            password_hash=admin_pass, role=UserRole.principal, status=UserStatus.active,
        )
        teacher_user = User(
            madrasa_id=mid, username="teacher1", password_hash=teacher_pass,
            role=UserRole.teacher, status=UserStatus.active,
        )
        db.add_all([principal, teacher_user])
        await db.flush()

        # TeacherProfile for principal (admin IS a teacher)
        admin_profile = TeacherProfile(
            madrasa_id=mid, user_id=principal.id, name="Admin",
            employee_code="ADMIN", status="active",
            whatsapp_number="+920000000000", join_date=date(2020, 1, 1),
            is_principal_delegate=True,
        )
        db.add(admin_profile)
        await db.flush()

        db.add(
            UserPermission(
                user_id=teacher_user.id,
                permission_code="attendance.take",
                granted_by_id=principal.id,
            )
        )

        teacher = TeacherProfile(
            madrasa_id=mid, user_id=teacher_user.id, name="Ustad 1",
            employee_code="T1", status="active",
            whatsapp_number="+923001234567", join_date=date(2020, 1, 1),
        )
        db.add(teacher)
        await db.flush()

        old_session = AcademicSession(
            madrasa_id=mid, name="1448 / 2026",
            gregorian_start=date(2026, 6, 1), gregorian_end=date(2027, 5, 31),
            hijri_span="1448", is_active=True,
        )
        db.add(old_session)
        await db.flush()

        student_pass = await hash_password("password")
        for i, sec in enumerate([sec_a1, sec_a2, sec_b1, sec_b2], start=1):
            user = User(
                madrasa_id=mid, username=f"student{i}", password_hash=student_pass,
                role=UserRole.student, status=UserStatus.active,
            )
            db.add(user)
            await db.flush()
            
            student = StudentProfile(
                madrasa_id=mid, user_id=user.id, admission_number=f"ADM-00{i}",
                name=f"Student {i}", date_of_birth=date(2015, 1, i), status="active",
            )
            db.add(student)
            await db.flush()
            
            db.add(
                Enrollment(
                    madrasa_id=mid, student_id=student.id, session_id=old_session.id,
                    program_id=program.id, class_id=sec.class_id, section_id=sec.id,
                    started_on=old_session.gregorian_start,
                )
            )

        db.add(
            TimetableSlot(
                madrasa_id=mid, teacher_id=teacher.id, session_id=old_session.id,
                class_id=class_a.id, section_id=sec_a1.id, course_id=course.id,
                day_of_week=6, period=1, start_time="16:00", end_time="16:40",
            )
        )
        
        await db.commit()
        print("Complete mock data successfully seeded!")

if __name__ == "__main__":
    asyncio.run(seed_all())
