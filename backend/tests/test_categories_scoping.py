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
from app.modules.academics.models import AcademicClass, ClassCourse, Course, Enrollment, Section
from app.modules.operations.models import Form, FormResponse
from app.modules.people.models import Guardian, StudentGuardian, StudentProfile

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
        db.add(
            StudentGuardian(
                madrasa_id=seed.madrasa.id,
                student_id=student.id,
                guardian_id=guardian.id,
            )
        )
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


async def test_form_list_filters_by_audience_scope(client, seed, db_sessionmaker):
    async with db_sessionmaker() as db:
        user_scoped = Form(
            madrasa_id=seed.madrasa.id,
            title="One guardian only",
            description="",
            category="survey",
            fields_definition=[{"key": "q1", "label": "Q1", "type": "text"}],
            visibility_scope={"users": [str(seed.teacher_user.id)], "roles": ["teacher"]},
            created_by_id=seed.principal.id,
        )
        class_scoped = Form(
            madrasa_id=seed.madrasa.id,
            title="Class 1 families",
            description="",
            category="survey",
            fields_definition=[{"key": "q1", "label": "Q1", "type": "text"}],
            visibility_scope={"classes": [str(seed.class_a.id)], "roles": ["parent"]},
            created_by_id=seed.principal.id,
        )
        section_scoped = Form(
            madrasa_id=seed.madrasa.id,
            title="Alif section",
            description="",
            category="survey",
            fields_definition=[{"key": "q1", "label": "Q1", "type": "text"}],
            visibility_scope={"sections": [str(seed.sections.a1.id)]},
            created_by_id=seed.principal.id,
        )
        course_scoped = Form(
            madrasa_id=seed.madrasa.id,
            title="Nazra course",
            description="",
            category="survey",
            fields_definition=[{"key": "q1", "label": "Q1", "type": "text"}],
            visibility_scope={"courses": [str(seed.course.id)]},
            created_by_id=seed.principal.id,
        )
        everyone = Form(
            madrasa_id=seed.madrasa.id,
            title="Everyone",
            description="",
            category="survey",
            fields_definition=[{"key": "q1", "label": "Q1", "type": "text"}],
            visibility_scope={"all": True},
            created_by_id=seed.principal.id,
        )
        db.add_all([user_scoped, class_scoped, section_scoped, course_scoped, everyone])
        await db.commit()

    resp = await client.get("/api/v1/operations/forms", params={"category": "survey", "audience_role": "parent"})
    assert resp.status_code == 200, resp.text
    assert {row["title"] for row in resp.json()} == {"Class 1 families", "Alif section", "Nazra course", "Everyone"}

    resp = await client.get("/api/v1/operations/forms", params={"category": "survey", "class_id": str(seed.class_a.id)})
    assert resp.status_code == 200, resp.text
    assert {row["title"] for row in resp.json()} == {"Class 1 families", "Everyone"}

    resp = await client.get("/api/v1/operations/forms", params={"category": "survey", "section_id": str(seed.sections.a1.id)})
    assert resp.status_code == 200, resp.text
    assert {row["title"] for row in resp.json()} == {"Alif section", "Everyone"}

    resp = await client.get("/api/v1/operations/forms", params={"category": "survey", "course_id": str(seed.course.id)})
    assert resp.status_code == 200, resp.text
    assert {row["title"] for row in resp.json()} == {"Nazra course", "Everyone"}

    resp = await client.get("/api/v1/operations/forms", params={"category": "survey", "user_id": str(seed.teacher_user.id)})
    assert resp.status_code == 200, resp.text
    assert {row["title"] for row in resp.json()} == {"One guardian only", "Alif section", "Nazra course", "Everyone"}


async def test_form_response_filters_include_guardian_ward_scope(client, seed, db_sessionmaker):
    madrasa_id = seed.madrasa.id
    program_id = seed.program.id
    session_id = seed.old_session.id
    session_start = seed.old_session.gregorian_start
    principal_id = seed.principal.id
    class_a_id = seed.class_a.id
    section_a1_id = seed.sections.a1.id
    seeded_course_id = seed.course.id
    ward_student = seed.students[0]
    async with db_sessionmaker() as db:
        extra_course = Course(madrasa_id=madrasa_id, name="Arabic")
        db.add(extra_course)
        await db.flush()
        class_bay = AcademicClass(madrasa_id=madrasa_id, program_id=program_id, name="Class Bay")
        db.add(class_bay)
        await db.flush()
        section_bay = Section(madrasa_id=madrasa_id, class_id=class_bay.id, name="Bay")
        db.add(section_bay)
        await db.flush()
        db.add(ClassCourse(madrasa_id=madrasa_id, class_id=class_bay.id, course_id=extra_course.id))
        outsider_user = User(
            madrasa_id=madrasa_id,
            username="student-outside-forms",
            password_hash="x",
            role=UserRole.student,
            status=UserStatus.active,
        )
        guardian_user = User(
            madrasa_id=madrasa_id,
            username="guardian-forms",
            password_hash="x",
            role=UserRole.parent,
            status=UserStatus.active,
        )
        db.add_all([outsider_user, guardian_user])
        await db.flush()
        outsider = StudentProfile(
            madrasa_id=madrasa_id,
            user_id=outsider_user.id,
            admission_number="ADM-FORM-OUT",
            name="Outside Student",
            date_of_birth=ward_student.date_of_birth,
            status="active",
        )
        guardian = Guardian(
            madrasa_id=madrasa_id,
            user_id=guardian_user.id,
            name="Form Guardian",
            relationship="father",
            phone_numbers="+923001234000",
        )
        form = Form(
            madrasa_id=madrasa_id,
            title="Daily check",
            description="",
            fields_definition=[{"key": "mood", "label": "Mood", "type": "text"}],
            visibility_scope={"all": True},
            allow_multiple=True,
            created_by_id=principal_id,
        )
        db.add_all([outsider, guardian, form])
        await db.flush()
        db.add_all([
            Enrollment(
                madrasa_id=madrasa_id,
                student_id=outsider.id,
                session_id=session_id,
                program_id=program_id,
                class_id=class_bay.id,
                section_id=section_bay.id,
                started_on=session_start,
            ),
            StudentGuardian(
                madrasa_id=madrasa_id,
                student_id=ward_student.id,
                guardian_id=guardian.id,
                portal_access=True,
            ),
            FormResponse(
                madrasa_id=madrasa_id,
                form_id=form.id,
                student_id=ward_student.id,
                submitted_by_id=ward_student.user_id,
                response_data={"mood": "student"},
            ),
            FormResponse(
                madrasa_id=madrasa_id,
                form_id=form.id,
                guardian_id=guardian.id,
                ward_id=ward_student.id,
                submitted_by_id=guardian_user.id,
                response_data={"mood": "guardian"},
            ),
            FormResponse(
                madrasa_id=madrasa_id,
                form_id=form.id,
                student_id=outsider.id,
                submitted_by_id=outsider_user.id,
                response_data={"mood": "outside"},
            ),
        ])
        await db.commit()
        form_id = form.id
        guardian_user_id = guardian_user.id
        ward_id = ward_student.id
        class_id = class_a_id
        section_id = section_a1_id
        course_id = seeded_course_id

    await _grant(db_sessionmaker, principal_id, "forms.responses.view", principal_id)

    resp = await client.get("/api/v1/operations/form-responses", params={"form_id": str(form_id), "class_id": str(class_id)})
    assert resp.status_code == 200, resp.text
    assert {row["response_data"]["mood"] for row in resp.json()} == {"student", "guardian"}

    resp = await client.get("/api/v1/operations/form-responses", params={"form_id": str(form_id), "section_id": str(section_id)})
    assert resp.status_code == 200, resp.text
    assert {row["response_data"]["mood"] for row in resp.json()} == {"student", "guardian"}

    resp = await client.get("/api/v1/operations/form-responses", params={"form_id": str(form_id), "course_id": str(course_id)})
    assert resp.status_code == 200, resp.text
    assert {row["response_data"]["mood"] for row in resp.json()} == {"student", "guardian"}

    resp = await client.get("/api/v1/operations/form-responses", params={"form_id": str(form_id), "respondent_role": "parent"})
    assert resp.status_code == 200, resp.text
    assert [row["response_data"]["mood"] for row in resp.json()] == ["guardian"]
    assert resp.json()[0]["submitted_by_name"] == "Form Guardian"
    assert resp.json()[0]["ward_name"] == "Student 1"

    resp = await client.get("/api/v1/operations/form-responses", params={"form_id": str(form_id), "respondent_user_id": str(guardian_user_id)})
    assert resp.status_code == 200, resp.text
    assert [row["response_data"]["mood"] for row in resp.json()] == ["guardian"]

    resp = await client.get("/api/v1/operations/form-responses", params={"form_id": str(form_id), "student_id": str(ward_id)})
    assert resp.status_code == 200, resp.text
    assert {row["response_data"]["mood"] for row in resp.json()} == {"student", "guardian"}


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


async def test_announcement_date_filters_accept_mobile_date_inputs(client):
    await client.post(
        "/api/v1/operations/announcements",
        json={"title": "Mobile date notice", "body": "...", "category": "general", "audience_scope": {"all": True}},
    )

    resp = await client.get(
        "/api/v1/operations/announcements",
        params={"date_from": "2026-01-01", "date_to": "2099-12-31"},
    )
    assert resp.status_code == 200, resp.text
    assert "Mobile date notice" in {a["title"] for a in resp.json()}
