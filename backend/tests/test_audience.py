"""Unified audience targeting (§6 of IMPLEMENT.md).

The same scope dict drives announcements, resources, and forms. These tests
exercise the resolver through the announcements endpoints: section targeting,
role gating + the teachers/students/all tabs, search, and teacher visibility
derived from timetable slots.
"""
from sqlalchemy import select

from app.modules.auth.models import User
from app.modules.operations.models import TimetableSlot

from tests.conftest import _make_client
from app.main import app as fastapi_app

import pytest


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


async def _post_announcement(client, title, scope):
    response = await client.post(
        "/api/v1/operations/announcements",
        json={"title": title, "body": f"{title} body", "audience_scope": scope},
    )
    assert response.status_code == 200, response.text
    return response.json()


async def _titles(client, **params):
    response = await client.get("/api/v1/operations/announcements", params=params)
    assert response.status_code == 200
    return {row["title"] for row in response.json()}


async def test_section_targeting(client, student_client, seed):
    # student1 is enrolled in section Alif (a1); a2 targets the other section.
    await _post_announcement(client, "for-a1", {"sections": [str(seed.sections.a1.id)]})
    await _post_announcement(client, "for-a2", {"sections": [str(seed.sections.a2.id)]})
    await _post_announcement(client, "for-everyone", {"all": True})

    seen = await _titles(student_client)
    assert seen == {"for-a1", "for-everyone"}
    # Principal sees everything.
    assert await _titles(client) >= {"for-a1", "for-a2", "for-everyone"}


async def test_role_gate_and_audience_tabs(client, teacher_client, student_client):
    await _post_announcement(client, "staff-only", {"roles": ["teacher"]})
    await _post_announcement(client, "students-only", {"roles": ["student"]})
    await _post_announcement(client, "everyone", {"all": True})

    assert await _titles(teacher_client) == {"staff-only", "everyone"}
    assert await _titles(student_client) == {"students-only", "everyone"}

    # Admin tab filters (three-tab UI).
    assert await _titles(client, audience="teachers") == {"staff-only", "everyone"}
    assert await _titles(client, audience="students") == {"students-only", "everyone"}
    assert await _titles(client, audience="all") == {"staff-only", "students-only", "everyone"}


async def test_announcement_search(client):
    await _post_announcement(client, "Eid holiday notice", {"all": True})
    await _post_announcement(client, "Exam schedule", {"all": True})

    assert await _titles(client, q="eid") == {"Eid holiday notice"}


async def test_course_targeting_reaches_teacher_via_slot(client, teacher_client, seed, db_sessionmaker):
    """Teacher visibility comes from what they teach (timetable ∪ legacy)."""
    async with db_sessionmaker() as db:
        db.add(
            TimetableSlot(
                madrasa_id=seed.madrasa.id,
                session_id=seed.old_session.id,
                class_id=seed.class_b.id,
                section_id=seed.sections.b1.id,
                course_id=seed.course.id,
                teacher_id=seed.teacher.id,
                day_of_week=2,
                period=1,
                start_time="10:00",
                end_time="10:40",
            )
        )
        await db.commit()

    await _post_announcement(client, "for-b1-section", {"sections": [str(seed.sections.b1.id)]})
    assert "for-b1-section" in await _titles(teacher_client)
