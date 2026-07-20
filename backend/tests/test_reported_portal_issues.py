"""Regression checks for the teacher/admin issues reported in Issues.pdf."""

import pytest
from fastapi import HTTPException
from sqlalchemy import func, select

from app.core.config import settings
from app.modules.messaging.models import MessageLog, MessageTemplate
from app.modules.messaging.routes import render_and_dispatch
from app.modules.auth.models import UserPermission


async def _grant_scoped(db_sessionmaker, seed, code: str, class_id) -> None:
    async with db_sessionmaker() as db:
        db.add(
            UserPermission(
                user_id=seed.teacher_user.id,
                permission_code=code,
                granted_by_id=seed.principal.id,
                scope_type="class",
                scope_id=class_id,
            )
        )
        await db.commit()


async def test_scoped_resource_grant_allows_category_and_in_scope_resource(
    teacher_client, seed, db_sessionmaker,
):
    await _grant_scoped(db_sessionmaker, seed, "resources.manage", seed.class_a.id)

    category_response = await teacher_client.post(
        "/api/v1/operations/resource-categories", json={"name": "Class A handouts"}
    )
    assert category_response.status_code == 200, category_response.text

    response = await teacher_client.post(
        "/api/v1/operations/resources",
        json={
            "category_id": category_response.json()["id"],
            "title": "Assigned section worksheet",
            "video_url": "https://example.com/lesson",
            "visibility_scope": {"sections": [str(seed.sections.a1.id)]},
        },
    )
    assert response.status_code == 200, response.text


async def test_scoped_form_grant_allows_in_scope_form(
    teacher_client, seed, db_sessionmaker,
):
    await _grant_scoped(db_sessionmaker, seed, "forms.create", seed.class_a.id)

    response = await teacher_client.post(
        "/api/v1/operations/forms",
        json={
            "title": "Assigned section survey",
            "fields": [{"key": "answer", "label": "Answer", "type": "text"}],
            "visibility_scope": {"sections": [str(seed.sections.a1.id)]},
        },
    )
    assert response.status_code == 200, response.text


async def test_walk_in_admission_requires_admissions_permission(teacher_client, seed):
    response = await teacher_client.post(
        "/api/v1/operations/admissions",
        json={
            "applicant_name": "Unprivileged applicant",
            "guardian_contact": "03001234567",
            "program_id": str(seed.program.id),
        },
    )
    assert response.status_code == 403


async def test_teacher_attendance_is_section_scoped(teacher_client, client, seed):
    profile = await teacher_client.get("/api/v1/auth/me")
    assert profile.status_code == 200, profile.text
    assert profile.json()["has_teaching_assignment"] is True

    choices = await teacher_client.get("/api/v1/attendance/classes")
    assert choices.status_code == 200, choices.text
    assert [row["id"] for row in choices.json()] == [str(seed.class_a.id)]
    assert [section["id"] for section in choices.json()[0]["sections"]] == [
        str(seed.sections.a1.id)
    ]

    assigned = await teacher_client.get(
        f"/api/v1/attendance/classes/{seed.class_a.id}/roster",
        params={"section_id": str(seed.sections.a1.id)},
    )
    assert assigned.status_code == 200, assigned.text
    assert {student["section_id"] for student in assigned.json()["students"]} == {
        str(seed.sections.a1.id)
    }

    denied = await teacher_client.get(
        f"/api/v1/attendance/classes/{seed.class_a.id}/roster",
        params={"section_id": str(seed.sections.a2.id)},
    )
    assert denied.status_code == 403

    unscoped_history = await teacher_client.get(
        f"/api/v1/attendance/classes/{seed.class_a.id}/history"
    )
    assert unscoped_history.status_code == 403

    assigned_history = await teacher_client.get(
        f"/api/v1/attendance/classes/{seed.class_a.id}/history",
        params={"section_id": str(seed.sections.a1.id)},
    )
    assert assigned_history.status_code == 200, assigned_history.text

    principal = await client.get("/api/v1/attendance/classes")
    principal_class = next(row for row in principal.json() if row["id"] == str(seed.class_a.id))
    assert {section["id"] for section in principal_class["sections"]} == {
        str(seed.sections.a1.id), str(seed.sections.a2.id)
    }


async def test_course_names_are_unique_per_madrasa(client):
    first = await client.post("/api/v1/academics/courses", json={"name": "Tajweed"})
    assert first.status_code == 200, first.text

    duplicate = await client.post("/api/v1/academics/courses", json={"name": "  tajWEED  "})
    assert duplicate.status_code == 409
    assert duplicate.json()["detail"] == "course_name_exists"


async def test_grading_scheme_and_exam_type_can_be_edited_and_deleted(client, seed):
    scheme = await client.post(
        "/api/v1/assessments/grading-schemes",
        json={"name": "Simple", "bands": [{"label": "Pass", "min_score": 0, "max_score": 100}]},
    )
    assert scheme.status_code == 200, scheme.text
    scheme_id = scheme.json()["id"]

    updated_scheme = await client.put(
        f"/api/v1/assessments/grading-schemes/{scheme_id}",
        json={"name": "Simple grading", "bands": [{"label": "Complete", "min_score": 0, "max_score": 100}]},
    )
    assert updated_scheme.status_code == 200, updated_scheme.text
    assert updated_scheme.json()["name"] == "Simple grading"

    exam = await client.post(
        "/api/v1/assessments/exam-types",
        json={
            "course_id": str(seed.course.id),
            "name": "Oral",
            "weightage": 40,
            "grading_scheme_id": scheme_id,
        },
    )
    assert exam.status_code == 200, exam.text
    exam_id = exam.json()["id"]

    updated_exam = await client.put(
        f"/api/v1/assessments/exam-types/{exam_id}",
        json={"name": "Oral assessment", "weightage": 50},
    )
    assert updated_exam.status_code == 200, updated_exam.text
    assert updated_exam.json()["weightage"] == 50

    deleted_exam = await client.delete(f"/api/v1/assessments/exam-types/{exam_id}")
    assert deleted_exam.status_code == 200, deleted_exam.text
    deleted_scheme = await client.delete(f"/api/v1/assessments/grading-schemes/{scheme_id}")
    assert deleted_scheme.status_code == 200, deleted_scheme.text


async def test_whatsapp_pdf_requires_direct_delivery_and_does_not_false_log(
    db_sessionmaker, seed, monkeypatch,
):
    monkeypatch.setattr(settings, "evolution_api_url", "")
    monkeypatch.setattr(settings, "evolution_api_key", "")
    monkeypatch.setattr(settings, "evolution_instance", "")
    async with db_sessionmaker() as db:
        db.add(MessageTemplate(
            madrasa_id=seed.madrasa.id,
            code="test_pdf",
            name="Test PDF",
            content={"en": "Report for {name}"},
        ))
        await db.commit()

        with pytest.raises(HTTPException) as exc_info:
            await render_and_dispatch(
                db,
                madrasa=seed.madrasa,
                current_user=seed.principal,
                template_code="test_pdf",
                language="en",
                variables={"name": "Student"},
                recipient_type="teacher",
                recipient_id=seed.teacher.id,
                phone_number=seed.teacher.whatsapp_number,
                attachment_bytes=b"%PDF-test",
            )
        assert exc_info.value.status_code == 503
        assert await db.scalar(select(func.count()).select_from(MessageLog)) == 0
