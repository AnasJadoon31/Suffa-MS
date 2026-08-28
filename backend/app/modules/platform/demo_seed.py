from datetime import date, datetime
from uuid import uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.modules.academics.models import (
    AcademicSession, AcademicClass, Course, Enrollment, Program,
    ClassCourse, Section
)
from app.modules.auth.models import User, UserRole, UserStatus
from app.modules.people.models import TeacherProfile, StudentProfile

async def seed_demo_data(madrasa_id, session: AsyncSession):
    hashed = await hash_password("password123")
    now = datetime.utcnow()

    # 1. Academic Session
    academic_session = AcademicSession(
        id=uuid4(), madrasa_id=madrasa_id,
        name="Current Year", gregorian_start=date(now.year, 1, 1),
        gregorian_end=date(now.year, 12, 31), hijri_span="1446",
        is_active=True, created_at=now, updated_at=now
    )
    session.add(academic_session)

    # 2. Program
    program = Program(
        id=uuid4(), madrasa_id=madrasa_id, name="Nazra",
        created_at=now, updated_at=now
    )
    session.add(program)
    await session.flush()

    # 3. Course
    course = Course(
        id=uuid4(), madrasa_id=madrasa_id, name="Qur'an",
        created_at=now, updated_at=now
    )
    session.add(course)
    await session.flush()

    # 4. Class & Section
    ac_class = AcademicClass(
        id=uuid4(), madrasa_id=madrasa_id, program_id=program.id,
        name="Nazra 1", default_portal_enabled=True,
        created_at=now, updated_at=now
    )
    session.add(ac_class)
    await session.flush()

    sec = Section(
        id=uuid4(), madrasa_id=madrasa_id, class_id=ac_class.id,
        name="A", created_at=now, updated_at=now
    )
    session.add(sec)
    
    cc = ClassCourse(
        id=uuid4(), madrasa_id=madrasa_id, class_id=ac_class.id,
        course_id=course.id, created_at=now, updated_at=now
    )
    session.add(cc)
    await session.flush()

    # 5. Teacher
    t_user = User(
        id=uuid4(), madrasa_id=madrasa_id, username="TCH-001",
        name="Qari Ahmad", password_hash=hashed, role=UserRole.teacher,
        status=UserStatus.active, created_at=now, updated_at=now
    )
    session.add(t_user)
    await session.flush()

    tp = TeacherProfile(
        id=uuid4(), madrasa_id=madrasa_id, user_id=t_user.id,
        employee_code="TCH-001", name="Qari Ahmad", status="active",
        whatsapp_number="03000000000",
        created_at=now, updated_at=now
    )
    session.add(tp)
    await session.flush()

    # 6. Students
    for i in range(1, 4):
        s_user = User(
            id=uuid4(), madrasa_id=madrasa_id, username=f"ADM-{i:03d}",
            name=f"Student {i}", password_hash=hashed, role=UserRole.student,
            status=UserStatus.active, created_at=now, updated_at=now
        )
        session.add(s_user)
        await session.flush()

        sp = StudentProfile(
            id=uuid4(), madrasa_id=madrasa_id, user_id=s_user.id,
            name=f"Student {i}", admission_number=f"ADM-{i:03d}",
            date_of_birth=date(2010, 1, 1),
            status="active", created_at=now, updated_at=now
        )
        session.add(sp)
        await session.flush()

        enr = Enrollment(
            id=uuid4(), madrasa_id=madrasa_id, student_id=sp.id,
            class_id=ac_class.id, section_id=sec.id, program_id=program.id,
            session_id=academic_session.id, started_on=academic_session.gregorian_start,
            created_at=now, updated_at=now
        )
        session.add(enr)
    
    await session.flush()
