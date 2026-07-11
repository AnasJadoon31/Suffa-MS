"""Shared fixtures: in-memory sqlite DB, seeded tenant, ASGI test client.

The whole app schema is created per test (PortableJSONB keeps the models
sqlite-compatible), so endpoint tests exercise the real routers, dependency
graph, and middleware stack — the layer where the production 500s lived.
"""
from datetime import date
from types import SimpleNamespace

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.core.dependencies import get_current_user
from app.db.base import Base
from app.db.session import get_session
from app.main import app as fastapi_app
from app.modules.academics.models import (
    AcademicClass,
    AcademicSession,
    ClassCourse,
    Course,
    Enrollment,
    Madrasa,
    Program,
    Section,
    TeacherAssignment,
)
from app.modules.auth.models import User, UserPermission, UserRole, UserStatus
from app.modules.people.models import StudentProfile, TeacherProfile


@pytest.fixture
async def engine():
    # StaticPool: every session shares the single in-memory sqlite connection.
    engine = create_async_engine(
        "sqlite+aiosqlite://",
        poolclass=StaticPool,
        connect_args={"check_same_thread": False},
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    await engine.dispose()


@pytest.fixture
async def db_sessionmaker(engine):
    return async_sessionmaker(engine, expire_on_commit=False)


@pytest.fixture
async def seed(db_sessionmaker):
    """One madrasa: two classes (each with sections Alif/Bay), one shared
    course, a principal, a teacher assigned to class A, and two students
    enrolled in class A for the active 2024-25 session."""
    async with db_sessionmaker() as db:
        madrasa = Madrasa(name="Test Madrasa", slug="test")
        db.add(madrasa)
        await db.flush()
        mid = madrasa.id

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
        db.add_all(
            [
                ClassCourse(madrasa_id=mid, class_id=class_a.id, course_id=course.id),
                ClassCourse(madrasa_id=mid, class_id=class_b.id, course_id=course.id),
            ]
        )

        principal = User(
            madrasa_id=mid, username="principal", password_hash="x",
            role=UserRole.principal, status=UserStatus.active,
        )
        teacher_user = User(
            madrasa_id=mid, username="teacher1", password_hash="x",
            role=UserRole.teacher, status=UserStatus.active,
        )
        db.add_all([principal, teacher_user])
        await db.flush()

        db.add(
            UserPermission(
                user_id=teacher_user.id,
                permission_code="attendance.take",
                granted_by_id=principal.id,
            )
        )

        teacher = TeacherProfile(
            madrasa_id=mid, user_id=teacher_user.id, name="Ustad",
            employee_code="T1", status="active",
            whatsapp_number="+920000000000", join_date=date(2020, 1, 1),
        )
        db.add(teacher)
        await db.flush()

        old_session = AcademicSession(
            madrasa_id=mid, name="2024-25",
            gregorian_start=date(2024, 4, 1), gregorian_end=date(2025, 3, 31),
            hijri_span="1445-46", is_active=True,
        )
        db.add(old_session)
        await db.flush()

        students = []
        for i, sec in enumerate([sec_a1, sec_a2], start=1):
            user = User(
                madrasa_id=mid, username=f"student{i}", password_hash="x",
                role=UserRole.student, status=UserStatus.active,
            )
            db.add(user)
            await db.flush()
            student = StudentProfile(
                madrasa_id=mid, user_id=user.id, admission_number=f"ADM-{i}",
                name=f"Student {i}", date_of_birth=date(2015, 1, i), status="active",
            )
            db.add(student)
            await db.flush()
            db.add(
                Enrollment(
                    madrasa_id=mid, student_id=student.id, session_id=old_session.id,
                    program_id=program.id, class_id=class_a.id, section_id=sec.id,
                )
            )
            students.append(student)

        db.add(
            TeacherAssignment(
                madrasa_id=mid, teacher_id=teacher.id, session_id=old_session.id,
                class_id=class_a.id, course_id=course.id,
            )
        )
        await db.commit()

    return SimpleNamespace(
        madrasa=madrasa,
        program=program,
        class_a=class_a,
        class_b=class_b,
        sections=SimpleNamespace(a1=sec_a1, a2=sec_a2, b1=sec_b1, b2=sec_b2),
        course=course,
        principal=principal,
        teacher_user=teacher_user,
        teacher=teacher,
        students=students,
        old_session=old_session,
    )


def _make_client(db_sessionmaker, seed, acting_user):
    async def override_get_session():
        async with db_sessionmaker() as session:
            yield session

    async def override_get_current_user():
        return acting_user

    fastapi_app.dependency_overrides[get_session] = override_get_session
    fastapi_app.dependency_overrides[get_current_user] = override_get_current_user
    return AsyncClient(
        transport=ASGITransport(app=fastapi_app),
        base_url="http://testserver",
        headers={
            "X-Madrasa": seed.madrasa.slug,
            "Origin": "https://app.example.com",
        },
    )


@pytest.fixture
async def client(db_sessionmaker, seed):
    """Client authenticated as the principal (implicit superuser)."""
    async_client = _make_client(db_sessionmaker, seed, seed.principal)
    async with async_client:
        yield async_client
    fastapi_app.dependency_overrides.clear()


@pytest.fixture
async def teacher_client(db_sessionmaker, seed):
    """Client authenticated as the seeded teacher."""
    async_client = _make_client(db_sessionmaker, seed, seed.teacher_user)
    async with async_client:
        yield async_client
    fastapi_app.dependency_overrides.clear()
