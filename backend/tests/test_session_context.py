"""Per-user academic-session context (§10 of IMPLEMENT.md).

Covers: PATCH /auth/me storing/clearing the per-user session preference,
tenant validation of the chosen session, and the write-guard that keeps
archived (non-active) sessions view-only.
"""
from datetime import date
from uuid import uuid4

import pytest

from app.modules.academics.models import AcademicSession
from app.modules.auth.models import User


@pytest.fixture
async def archived_session(db_sessionmaker, seed):
    """A second, non-active session for the seeded madrasa."""
    async with db_sessionmaker() as db:
        record = AcademicSession(
            madrasa_id=seed.madrasa.id,
            name="2023-24",
            gregorian_start=date(2023, 4, 1),
            gregorian_end=date(2024, 3, 31),
            hijri_span="1444-45",
            is_active=False,
        )
        db.add(record)
        await db.commit()
    return record


async def test_patch_me_stores_session_preference(client, seed, db_sessionmaker, archived_session):
    response = await client.patch(
        "/api/v1/auth/me", json={"selected_session_id": str(archived_session.id)}
    )
    assert response.status_code == 200
    assert response.json()["user"]["selected_session_id"] == str(archived_session.id)

    # Verify persistence in the DB rather than via GET /auth/me: the test
    # client's get_current_user override returns a fixed detached instance.
    async with db_sessionmaker() as db:
        stored = await db.get(User, seed.principal.id)
        assert stored.selected_session_id == archived_session.id


async def test_patch_me_clears_session_preference(client, archived_session):
    await client.patch(
        "/api/v1/auth/me", json={"selected_session_id": str(archived_session.id)}
    )
    response = await client.patch("/api/v1/auth/me", json={"clear_selected_session": True})
    assert response.status_code == 200
    assert response.json()["user"]["selected_session_id"] is None


async def test_patch_me_rejects_unknown_session(client):
    response = await client.patch(
        "/api/v1/auth/me", json={"selected_session_id": str(uuid4())}
    )
    assert response.status_code == 404


async def test_enroll_into_archived_session_is_rejected(client, seed, archived_session):
    payload = {
        "student_id": str(seed.students[0].id),
        "session_id": str(archived_session.id),
        "program_id": str(seed.program.id),
        "class_id": str(seed.class_a.id),
        "section_id": str(seed.sections.a1.id),
    }
    response = await client.post("/api/v1/academics/students/enroll", json=payload)
    assert response.status_code == 403
    assert response.json()["detail"] == "session_view_only"


async def test_enroll_into_active_session_still_works(client, seed):
    payload = {
        "student_id": str(seed.students[0].id),
        "session_id": str(seed.old_session.id),
        "program_id": str(seed.program.id),
        "class_id": str(seed.class_a.id),
        "section_id": str(seed.sections.a2.id),
    }
    response = await client.post("/api/v1/academics/students/enroll", json=payload)
    assert response.status_code == 200
    assert response.json()["status"] == "success"


async def test_permission_protected_writes_are_blocked_in_archived_context(
    client, seed, archived_session, db_sessionmaker
):
    """The shared permission dependency is the safety net for management
    writes, including endpoints whose models are not directly session-keyed."""
    async with db_sessionmaker() as db:
        principal = await db.get(User, seed.principal.id)
        principal.selected_session_id = archived_session.id
        await db.commit()
    response = await client.post(
        "/api/v1/operations/holidays",
        json={"name": "Archived edit", "start_date": "2023-08-01", "end_date": "2023-08-01"},
    )
    assert response.status_code == 403
    assert response.json()["detail"] == "session_view_only"
