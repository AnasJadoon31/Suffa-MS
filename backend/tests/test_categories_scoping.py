"""Regression coverage for the B6/B7-k/B9/B10 work:

- B7-k: enrolling a student into a class with default_portal_enabled=False
  disables their own portal login and auto-provisions a guardian login.
- B9: per-teacher resource categories (private vs. global) and teaching-scope
  enforcement on where a teacher may target a resource.
- B10: forms categories + the same teaching-scope enforcement + ownership on
  edit/delete.
- B6: announcement category filter.
"""
from sqlalchemy import select

from app.modules.auth.models import User, UserPermission, UserRole, UserStatus
from app.modules.people.models import Guardian, StudentGuardian

from tests.conftest import _make_client
from app.main import app as fastapi_app

import pytest


async def _grant(db_sessionmaker, user_id, code, granted_by_id):
    async with db_sessionmaker() as db:
        db.add(UserPermission(user_id=user_id, permission_code=code, granted_by_id=granted_by_id))
        await db.commit()


@pytest.fixture
async def teacher2_client(db_sessionmaker, seed):
    """A second teacher with no class/course assignments at all — used to
    prove teaching-scope enforcement (not just permission-gate) is real."""
    async with db_sessionmaker() as db:
        user = User(
            madrasa_id=seed.madrasa.id, username="teacher2", password_hash="x",
            role=UserRole.teacher, status=UserStatus.active,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
    async_client = _make_client(db_sessionmaker, seed, user)
    async with async_client:
        yield async_client, user
    fastapi_app.dependency_overrides.clear()


# --------------------------------------------------------- B7-k: enrollment

async def test_enrollment_provisions_guardian_login_when_portal_disabled(client, seed, db_sessionmaker):
    student = seed.students[0]

    async with db_sessionmaker() as db:
        guardian = Guardian(
            madrasa_id=seed.madrasa.id, name="Abu Student", relationship="father",
            phone_numbers="+920000000001",
        )
        db.add(guardian)
        await db.flush()
        db.add(StudentGuardian(student_id=student.id, guardian_id=guardian.id))
        await db.commit()
        guardian_id = guardian.id

    # Switch the class to no-student-portal.
    resp = await client.put(
        f"/api/v1/academics/classes/{seed.class_a.id}", json={"default_portal_enabled": False}
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["default_portal_enabled"] is False

    resp = await client.post(
        "/api/v1/academics/students/enroll",
        json={
            "student_id": str(student.id),
            "session_id": str(seed.old_session.id),
            "program_id": str(seed.program.id),
            "class_id": str(seed.class_a.id),
            "section_id": str(seed.sections.a1.id),
        },
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert len(body["guardian_logins_provisioned"]) == 1
    assert body["guardian_logins_provisioned"][0]["guardian_id"] == str(guardian_id)

    async with db_sessionmaker() as db:
        refreshed_guardian = await db.get(Guardian, guardian_id)
        assert refreshed_guardian.user_id is not None
        guardian_user = await db.get(User, refreshed_guardian.user_id)
        assert guardian_user.role.value == "parent"

        student_user = (
            await db.execute(select(User).where(User.id == student.user_id))
        ).scalar_one()
        assert student_user.portal_enabled is False

    # Re-enrolling doesn't try to re-provision an already-linked guardian.
    resp = await client.post(
        "/api/v1/academics/students/enroll",
        json={
            "student_id": str(student.id),
            "session_id": str(seed.old_session.id),
            "program_id": str(seed.program.id),
            "class_id": str(seed.class_a.id),
            "section_id": str(seed.sections.a1.id),
        },
    )
    assert resp.status_code == 200
    assert resp.json()["guardian_logins_provisioned"] == []


# --------------------------------------------------------------- B9: resources

async def test_resource_category_privacy(client, teacher_client, teacher2_client, seed, db_sessionmaker):
    teacher2, teacher2_user = teacher2_client
    await _grant(db_sessionmaker, seed.teacher_user.id, "resources.manage", seed.principal.id)
    await _grant(db_sessionmaker, teacher2_user.id, "resources.manage", seed.principal.id)

    resp = await teacher_client.post("/api/v1/operations/resource-categories", json={"name": "My Private Stuff"})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["is_mine"] is True
    assert body["owner_id"] is not None

    # The other teacher (no resources.manage_all) must not see it.
    resp = await teacher2.get("/api/v1/operations/resource-categories")
    names = {c["name"] for c in resp.json()}
    assert "My Private Stuff" not in names

    # The admin (principal, implicit superuser) sees every category.
    resp = await client.get("/api/v1/operations/resource-categories")
    names = {c["name"] for c in resp.json()}
    assert "My Private Stuff" in names


async def test_teacher_can_only_target_sections_they_teach(client, teacher_client, seed, db_sessionmaker):
    await _grant(db_sessionmaker, seed.teacher_user.id, "resources.manage", seed.principal.id)
    resp = await teacher_client.post("/api/v1/operations/resource-categories", json={"name": "Handouts"})
    category_id = resp.json()["id"]

    # class_a is legacy-assigned to the teacher — any of its sections match.
    resp = await teacher_client.post(
        "/api/v1/operations/resources",
        json={
            "category_id": category_id, "title": "Worksheet 1", "video_url": "https://example.com/v",
            "visibility_scope": {"sections": [str(seed.sections.a1.id)]},
        },
    )
    assert resp.status_code == 200, resp.text

    # class_b is not assigned to the teacher at all.
    resp = await teacher_client.post(
        "/api/v1/operations/resources",
        json={
            "category_id": category_id, "title": "Worksheet 2", "video_url": "https://example.com/v",
            "visibility_scope": {"sections": [str(seed.sections.b1.id)]},
        },
    )
    assert resp.status_code == 403

    # Broadcasting to everyone requires the admin-override permission.
    resp = await teacher_client.post(
        "/api/v1/operations/resources",
        json={
            "category_id": category_id, "title": "Worksheet 3", "video_url": "https://example.com/v",
            "visibility_scope": {"all": True},
        },
    )
    assert resp.status_code == 403


async def test_resource_ownership_on_update_and_delete(client, teacher_client, teacher2_client, seed, db_sessionmaker):
    teacher2, teacher2_user = teacher2_client
    await _grant(db_sessionmaker, seed.teacher_user.id, "resources.manage", seed.principal.id)
    await _grant(db_sessionmaker, teacher2_user.id, "resources.manage", seed.principal.id)

    resp = await teacher_client.post("/api/v1/operations/resource-categories", json={"name": "Cat"})
    category_id = resp.json()["id"]
    resp = await teacher_client.post(
        "/api/v1/operations/resources",
        json={
            "category_id": category_id, "title": "Mine", "video_url": "https://example.com/v",
            "visibility_scope": {"sections": [str(seed.sections.a1.id)]},
        },
    )
    resource_id = resp.json()["id"]

    # A different teacher without resources.manage_all cannot edit/delete it.
    resp = await teacher2.put(f"/api/v1/operations/resources/{resource_id}", json={"title": "Hijacked"})
    assert resp.status_code == 403
    resp = await teacher2.delete(f"/api/v1/operations/resources/{resource_id}")
    assert resp.status_code == 403

    # The admin can.
    resp = await client.put(f"/api/v1/operations/resources/{resource_id}", json={"title": "Admin edited"})
    assert resp.status_code == 200
    assert resp.json()["title"] == "Admin edited"


# ------------------------------------------------------------------ B10: forms

async def test_form_category_and_scoped_creation(client, teacher_client, seed, db_sessionmaker):
    await _grant(db_sessionmaker, seed.teacher_user.id, "forms.create", seed.principal.id)

    resp = await teacher_client.post(
        "/api/v1/operations/forms",
        json={
            "title": "Feedback", "category": "feedback", "fields": [{"key": "q1", "label": "Q1", "type": "text"}],
            "visibility_scope": {"sections": [str(seed.sections.a1.id)]},
        },
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["category"] == "feedback"

    resp = await teacher_client.post(
        "/api/v1/operations/forms",
        json={
            "title": "Out of scope", "fields": [{"key": "q1", "label": "Q1", "type": "text"}],
            "visibility_scope": {"sections": [str(seed.sections.b1.id)]},
        },
    )
    assert resp.status_code == 403

    resp = await client.get("/api/v1/operations/forms", params={"category": "feedback"})
    assert resp.status_code == 200
    assert {f["title"] for f in resp.json()} == {"Feedback"}


async def test_form_ownership_on_update_and_delete(client, teacher_client, teacher2_client, seed, db_sessionmaker):
    teacher2, teacher2_user = teacher2_client
    await _grant(db_sessionmaker, seed.teacher_user.id, "forms.create", seed.principal.id)
    await _grant(db_sessionmaker, teacher2_user.id, "forms.create", seed.principal.id)

    resp = await teacher_client.post(
        "/api/v1/operations/forms",
        json={
            "title": "Mine", "fields": [{"key": "q1", "label": "Q1", "type": "text"}],
            "visibility_scope": {"sections": [str(seed.sections.a1.id)]},
        },
    )
    form_id = resp.json()["id"]

    resp = await teacher2.put(f"/api/v1/operations/forms/{form_id}", json={"title": "Hijacked"})
    assert resp.status_code == 403
    resp = await teacher2.delete(f"/api/v1/operations/forms/{form_id}")
    assert resp.status_code == 403

    resp = await client.delete(f"/api/v1/operations/forms/{form_id}")
    assert resp.status_code == 200


# --------------------------------------------------------- B6: announcements

async def test_announcement_category_filter(client):
    await client.post(
        "/api/v1/operations/announcements",
        json={"title": "Exam week", "body": "...", "category": "exam", "audience_scope": {"all": True}},
    )
    await client.post(
        "/api/v1/operations/announcements",
        json={"title": "Eid break", "body": "...", "category": "holiday", "audience_scope": {"all": True}},
    )
    resp = await client.get("/api/v1/operations/announcements", params={"category": "exam"})
    assert resp.status_code == 200
    assert {a["title"] for a in resp.json()} == {"Exam week"}
