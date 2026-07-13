"""Route × role authorization matrix (§9.1 of IMPLEMENT.md).

Nav hiding is not authorization: every privileged route must reject callers
without the backing permission. The student holds no grants at all; the seeded
teacher holds only attendance.take. Both must get 403 on everything below.
Also covers cross-tenant IDOR: a principal of madrasa A cannot read a student
of madrasa B.
"""
from datetime import date

import pytest

from sqlalchemy import select

from app.main import app as fastapi_app
from app.modules.academics.models import Madrasa
from app.modules.auth.models import User, UserRole, UserStatus
from app.modules.people.models import StudentProfile, TeacherProfile

from tests.conftest import _make_client


PRIVILEGED_ROUTES = [
    ("get", "/api/v1/people/teachers", None),
    ("get", "/api/v1/people/students", None),
    ("get", "/api/v1/finance/payments", None),
    ("get", "/api/v1/finance/donors", None),
    ("get", "/api/v1/operations/admissions", None),
    ("get", "/api/v1/platform/madaris", None),
    ("post", "/api/v1/academics/programs", {"name": "Sneaky Program"}),
    ("post", "/api/v1/operations/holidays", {"name": "Fake Holiday", "start_date": "2024-06-17", "end_date": "2024-06-18"}),
    ("put", "/api/v1/operations/settings", {"key": "x", "value": "y"}),
]


@pytest.fixture
async def student_client(db_sessionmaker, seed):
    async with db_sessionmaker() as db:
        student_user = (
            await db.execute(select(User).where(User.username == "student1"))
        ).scalar_one()
    async_client = _make_client(db_sessionmaker, seed, student_user)
    async with async_client:
        yield async_client
    fastapi_app.dependency_overrides.clear()


@pytest.mark.parametrize("method,path,body", PRIVILEGED_ROUTES)
async def test_student_gets_403_on_privileged_routes(student_client, method, path, body):
    response = await getattr(student_client, method)(path, **({"json": body} if body else {}))
    assert response.status_code == 403, f"{method.upper()} {path} returned {response.status_code}"


@pytest.mark.parametrize("method,path,body", PRIVILEGED_ROUTES)
async def test_teacher_gets_403_on_privileged_routes(teacher_client, method, path, body):
    response = await getattr(teacher_client, method)(path, **({"json": body} if body else {}))
    assert response.status_code == 403, f"{method.upper()} {path} returned {response.status_code}"


async def test_permission_grant_endpoint_rejects_non_principal(teacher_client, seed):
    response = await teacher_client.put(
        "/api/v1/auth/permissions/grants",
        json={"user_id": str(seed.teacher_user.id), "permission_codes": ["holidays.manage"]},
    )
    assert response.status_code == 403


async def test_cross_tenant_student_is_invisible(client, db_sessionmaker):
    """Principal of madrasa A must get 404 for a student of madrasa B."""
    async with db_sessionmaker() as db:
        other = Madrasa(name="Other Madrasa", slug="other")
        db.add(other)
        await db.flush()
        outsider_user = User(
            madrasa_id=other.id, username="outsider", password_hash="x",
            role=UserRole.student, status=UserStatus.active,
        )
        db.add(outsider_user)
        await db.flush()
        outsider = StudentProfile(
            madrasa_id=other.id, user_id=outsider_user.id, admission_number="OTH-1",
            name="Outsider", date_of_birth=date(2014, 1, 1), status="active",
        )
        db.add(outsider)
        await db.commit()
        outsider_id = outsider.id

    response = await client.get(f"/api/v1/people/students/{outsider_id}")
    assert response.status_code == 404


async def test_x_madrasa_header_cannot_spoof_tenant(client, db_sessionmaker, seed):
    """OWASP A01 regression: get_current_madrasa must resolve the tenant from
    the authenticated user's own madrasa_id, never from the client-supplied
    X-Madrasa header — otherwise a principal of madrasa A could read/write
    madrasa B's data just by sending a different header, since role-based
    checks (principal = implicit superuser) carry no tenant scope of their
    own. Here the principal is authenticated for the seeded ("test") tenant
    but sends X-Madrasa: other-tenant's slug; the response must still be
    scoped to the principal's own tenant, not "other"."""
    async with db_sessionmaker() as db:
        other = Madrasa(name="Other Madrasa", slug="other-tenant")
        db.add(other)
        await db.flush()
        other_student_user = User(
            madrasa_id=other.id, username="other-student", password_hash="x",
            role=UserRole.student, status=UserStatus.active,
        )
        db.add(other_student_user)
        await db.flush()
        other_student = StudentProfile(
            madrasa_id=other.id, user_id=other_student_user.id, admission_number="OTH-9",
            name="Should Not Leak", date_of_birth=date(2014, 1, 1), status="active",
        )
        db.add(other_student)
        await db.commit()
        other_student_id = other_student.id

    client.headers["X-Madrasa"] = "other-tenant"
    response = await client.get("/api/v1/people/students")
    assert response.status_code == 200
    names = [row["name"] for row in response.json()]
    assert "Should Not Leak" not in names
    # And direct-by-id access to the other tenant's record must still 404,
    # even though the spoofed header names that tenant.
    direct = await client.get(f"/api/v1/people/students/{other_student_id}")
    assert direct.status_code == 404


async def test_salary_routes_reject_cross_tenant_teacher_id(client, db_sessionmaker, seed):
    """Regression: GET /finance/salary/{teacher_id} and
    GET /finance/salary/{teacher_id}/payments previously had no tenant scoping
    at all — a caller with teachers.salary.manage (principal is an implicit
    superuser for that permission code, with no tenant scope of its own)
    could read another madrasa's salary data just by guessing/knowing its
    teacher_id. Both must now 404 for a teacher belonging to a different
    tenant, even from a legitimately-scoped client (no header spoofing
    involved — the bug was in the route itself)."""
    async with db_sessionmaker() as db:
        other = Madrasa(name="Other Madrasa", slug="other-salary-tenant")
        db.add(other)
        await db.flush()
        other_teacher_user = User(
            madrasa_id=other.id, username="other-teacher", password_hash="x",
            role=UserRole.teacher, status=UserStatus.active,
        )
        db.add(other_teacher_user)
        await db.flush()
        other_teacher = TeacherProfile(
            madrasa_id=other.id, user_id=other_teacher_user.id, name="Outsider Teacher",
            employee_code="OTH-T1", status="active", whatsapp_number="+920000000001",
        )
        db.add(other_teacher)
        await db.commit()
        other_teacher_id = other_teacher.id

    record_response = await client.get(f"/api/v1/finance/salary/{other_teacher_id}")
    assert record_response.status_code == 404

    payments_response = await client.get(f"/api/v1/finance/salary/{other_teacher_id}/payments")
    assert payments_response.status_code == 404
