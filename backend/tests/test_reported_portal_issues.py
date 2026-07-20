"""Regression checks for the teacher/admin issues reported in Issues.pdf."""

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
    assert "already exists" in duplicate.json()["detail"].lower()


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
