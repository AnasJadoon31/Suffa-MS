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
from app.modules.people.models import StudentProfile

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
