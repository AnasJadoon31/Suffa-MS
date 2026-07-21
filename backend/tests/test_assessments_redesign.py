"""§5 assessments redesign: multi-section publish, batch edit/delete,
category filters, results matrix + export."""
from datetime import UTC, datetime
from uuid import UUID

import pytest

from sqlalchemy import select

from app.modules.assessments.models import Assignment, ExamType, GradingScheme, Mark, Submission
from app.modules.auth.models import User
from app.modules.operations.models import TimetableSlot
from app.modules.academics.models import Enrollment

from tests.conftest import _make_client
from app.main import app as fastapi_app


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


def _assignment_payload(seed, **overrides):
    payload = {
        "class_id": str(seed.class_a.id),
        "course_id": str(seed.course.id),
        "title": "Weekly sabaq",
        "category": "homework",
        "instructions": "Memorise lesson 5",
        "due_date": "2024-07-01T00:00:00Z",
    }
    payload.update(overrides)
    return payload


async def test_multi_section_publish_shares_batch(client, seed):
    response = await client.post(
        "/api/v1/assessments/assignments",
        json=_assignment_payload(
            seed, section_ids=[str(seed.sections.a1.id), str(seed.sections.a2.id)]
        ),
    )
    assert response.status_code == 200
    rows = response.json()
    assert len(rows) == 2
    assert rows[0]["batch_id"] is not None
    assert rows[0]["batch_id"] == rows[1]["batch_id"]
    assert {row["section_name"] for row in rows} == {"Alif", "Bay"}


async def test_admin_can_sort_assignment_page_by_teacher(client, seed):
    await client.post(
        "/api/v1/assessments/assignments",
        json=_assignment_payload(seed, title="Teacher-organized", section_ids=[str(seed.sections.a1.id)]),
    )
    response = await client.get(
        "/api/v1/assessments/assignments",
        params={"sort": "teacher", "limit": 25, "offset": 0},
    )
    assert response.status_code == 200
    assert response.headers["x-total-count"] == "1"
    assert response.json()[0]["title"] == "Teacher-organized"


async def test_batch_edit_fans_out_and_delete_whole_batch(client, seed, db_sessionmaker):
    created = (
        await client.post(
            "/api/v1/assessments/assignments",
            json=_assignment_payload(
                seed, section_ids=[str(seed.sections.a1.id), str(seed.sections.a2.id)]
            ),
        )
    ).json()

    edit = await client.put(
        f"/api/v1/assessments/assignments/{created[0]['id']}",
        json={"title": "Renamed", "apply_to_batch": True},
    )
    assert edit.status_code == 200
    async with db_sessionmaker() as db:
        titles = (
            await db.execute(select(Assignment.title).where(Assignment.batch_id == UUID(created[0]["batch_id"])))
        ).scalars().all()
        assert titles == ["Renamed", "Renamed"]

    delete = await client.delete(
        f"/api/v1/assessments/assignments/{created[0]['id']}", params={"whole_batch": True}
    )
    assert delete.status_code == 200
    assert delete.json()["count"] == 2


async def test_student_sees_only_own_section_assignments(client, student_client, seed):
    # student1 is in section Alif (a1).
    await client.post(
        "/api/v1/assessments/assignments",
        json=_assignment_payload(seed, title="a1 only", section_ids=[str(seed.sections.a1.id)]),
    )
    await client.post(
        "/api/v1/assessments/assignments",
        json=_assignment_payload(seed, title="a2 only", section_ids=[str(seed.sections.a2.id)]),
    )
    await client.post(
        "/api/v1/assessments/assignments",
        json=_assignment_payload(seed, title="class wide"),
    )

    response = await student_client.get("/api/v1/assessments/assignments")
    titles = {row["title"] for row in response.json()}
    assert titles == {"a1 only", "class wide"}


async def test_student_cannot_read_or_submit_assignment_outside_enrollment(client, student_client, seed):
    created = await client.post(
        "/api/v1/assessments/assignments",
        json=_assignment_payload(seed, class_id=str(seed.class_b.id), title="Other class"),
    )
    assert created.status_code == 200, created.text
    assignment_id = created.json()[0]["id"]

    detail = await student_client.get(f"/api/v1/assessments/assignments/{assignment_id}")
    assert detail.status_code == 403
    submission = await student_client.post(
        f"/api/v1/assessments/assignments/{assignment_id}/submissions",
        json={"file_key": "submissions/not-mine.pdf"},
    )
    assert submission.status_code == 403


async def test_student_without_active_enrollment_sees_no_class_wide_assignments(
    client, student_client, db_sessionmaker, seed,
):
    created = await client.post(
        "/api/v1/assessments/assignments",
        json=_assignment_payload(seed, title="Class-wide assignment"),
    )
    assert created.status_code == 200, created.text
    async with db_sessionmaker() as db:
        enrollment = (
            await db.execute(select(Enrollment).where(Enrollment.student_id == seed.students[0].id))
        ).scalar_one()
        await db.delete(enrollment)
        await db.commit()

    response = await student_client.get("/api/v1/assessments/assignments")
    assert response.status_code == 200
    assert response.json() == []


async def test_publish_all_classes_creates_one_row_per_mapped_class(client, seed):
    response = await client.post(
        "/api/v1/assessments/assignments",
        json={
            "course_id": str(seed.course.id),
            "all_classes": True,
            "title": "All-classes memo",
            "instructions": "Read chapter 3",
            "due_date": "2024-07-01T00:00:00Z",
        },
    )
    assert response.status_code == 200
    rows = response.json()
    # course is mapped to class_a and class_b in the seed.
    assert {row["class_name"] for row in rows} == {"Class 1", "Class 2"}
    assert all(row["section_id"] is None for row in rows)
    assert rows[0]["batch_id"] is not None
    assert rows[0]["batch_id"] == rows[1]["batch_id"]


async def test_publish_all_classes_denied_without_manage_all(teacher_client, seed, db_sessionmaker):
    from app.modules.auth.models import UserPermission

    # Give the teacher a plain (madrasa-wide) assignments.create grant, so
    # the 403 below is specifically the all_classes/manage_all gate, not the
    # base "can this user create assignments at all" check.
    async with db_sessionmaker() as db:
        db.add(
            UserPermission(
                user_id=seed.teacher_user.id,
                permission_code="assignments.create",
                granted_by_id=seed.principal.id,
            )
        )
        await db.commit()

    response = await teacher_client.post(
        "/api/v1/assessments/assignments",
        json={
            "course_id": str(seed.course.id),
            "all_classes": True,
            "title": "Should fail",
            "instructions": "n/a",
            "due_date": "2024-07-01T00:00:00Z",
        },
    )
    assert response.status_code == 403


async def test_publish_all_classes_rejects_section_ids(client, seed):
    response = await client.post(
        "/api/v1/assessments/assignments",
        json={
            "course_id": str(seed.course.id),
            "all_classes": True,
            "section_ids": [str(seed.sections.a1.id)],
            "title": "Bad combo",
            "instructions": "n/a",
            "due_date": "2024-07-01T00:00:00Z",
        },
    )
    assert response.status_code == 422


async def test_grading_plan_is_saved_atomically_and_rejects_invalid_total(client, seed):
    created = await client.put(
        "/api/v1/assessments/grading-plan",
        json={
            "course_id": str(seed.course.id),
            "class_id": str(seed.class_a.id),
            "name": "Class 1 Nazra",
            "assignment_weightage": 30,
            "components": [{"name": "Final recitation", "weightage": 70}],
            "bands": [
                {"label": "Needs support", "min_score": 0, "max_score": 59.99},
                {"label": "Pass", "min_score": 60, "max_score": 100},
            ],
        },
    )
    assert created.status_code == 200, created.text
    plan = created.json()
    assert plan["assignment_weightage"] == 30
    assert plan["components"][0]["name"] == "Final recitation"

    invalid = await client.put(
        "/api/v1/assessments/grading-plan",
        json={
            **{key: value for key, value in plan.items() if key in {
                "course_id", "class_id", "name", "bands", "assignment_weightage"
            }},
            "components": [{"name": "Changed despite failure", "weightage": 60}],
        },
    )
    assert invalid.status_code == 422

    fetched = await client.get(
        "/api/v1/assessments/grading-plan",
        params={"course_id": str(seed.course.id), "class_id": str(seed.class_a.id)},
    )
    assert fetched.status_code == 200, fetched.text
    assert fetched.json()["components"][0]["name"] == "Final recitation"


async def test_grading_plan_reads_legacy_scheme_without_recreating_components(client, seed):
    scheme = await client.post(
        "/api/v1/assessments/grading-schemes",
        json={
            "name": "Legacy",
            "bands": [{"label": "Complete", "min_score": 0, "max_score": 100}],
        },
    )
    exam = await client.post(
        "/api/v1/assessments/exam-types",
        json={
            "course_id": str(seed.course.id),
            "class_id": str(seed.class_a.id),
            "name": "Legacy oral",
            "weightage": 100,
            "grading_scheme_id": scheme.json()["id"],
        },
    )

    response = await client.get(
        "/api/v1/assessments/grading-plan",
        params={"course_id": str(seed.course.id), "class_id": str(seed.class_a.id)},
    )

    assert response.status_code == 200, response.text
    assert response.json()["components"] == [
        {"id": exam.json()["id"], "name": "Legacy oral", "weightage": 100.0}
    ]


async def test_class_grading_plan_replaces_course_default_in_results(client, seed):
    base = {
        "course_id": str(seed.course.id),
        "name": "Nazra plan",
        "assignment_weightage": 0,
        "bands": [{"label": "Score", "min_score": 0, "max_score": 100}],
    }
    default = await client.put(
        "/api/v1/assessments/grading-plan",
        json={**base, "components": [{"name": "Default exam", "weightage": 100}]},
    )
    override = await client.put(
        "/api/v1/assessments/grading-plan",
        json={
            **base,
            "class_id": str(seed.class_a.id),
            "components": [{"name": "Class exam", "weightage": 100}],
        },
    )
    assert default.status_code == override.status_code == 200
    for exam_id, score in (
        (default.json()["components"][0]["id"], 20),
        (override.json()["components"][0]["id"], 80),
    ):
        marked = await client.put(
            "/api/v1/assessments/marks",
            json={"exam_type_id": exam_id, "student_id": str(seed.students[0].id), "score": score},
        )
        assert marked.status_code == 200, marked.text

    result = await client.get(
        "/api/v1/assessments/results/course",
        params={"student_id": str(seed.students[0].id), "course_id": str(seed.course.id)},
    )
    assert result.status_code == 200, result.text
    assert result.json()["raw_score"] == 80


async def test_grading_plan_normalizes_unweighted_assignments_into_one_pool(
    client, seed, db_sessionmaker,
):
    plan = await client.put(
        "/api/v1/assessments/grading-plan",
        json={
            "course_id": str(seed.course.id),
            "class_id": str(seed.class_a.id),
            "name": "Pooled assignments",
            "assignment_weightage": 30,
            "components": [{"name": "Exam", "weightage": 70}],
            "bands": [{"label": "Score", "min_score": 0, "max_score": 100}],
        },
    )
    exam_type_id = plan.json()["components"][0]["id"]
    mark = await client.put(
        "/api/v1/assessments/marks",
        json={"exam_type_id": exam_type_id, "student_id": str(seed.students[0].id), "score": 80},
    )
    assert mark.status_code == 200, mark.text

    assignment_ids = []
    for title in ("Sabaq 1", "Sabaq 2"):
        response = await client.post(
            "/api/v1/assessments/assignments",
            json={
                "class_id": str(seed.class_a.id),
                "section_ids": [str(seed.sections.a1.id)],
                "course_id": str(seed.course.id),
                "title": title,
                "instructions": "Recite",
                "due_date": "2099-01-01T00:00:00Z",
                "max_marks": 100,
            },
        )
        assert response.status_code == 200, response.text
        assignment_ids.append(UUID(response.json()[0]["id"]))

    async with db_sessionmaker() as db:
        db.add_all([
            Submission(
                assignment_id=assignment_ids[0], student_id=seed.students[0].id,
                submitted_at=datetime.now(UTC), file_key="one.pdf", mark=100,
            ),
            Submission(
                assignment_id=assignment_ids[1], student_id=seed.students[0].id,
                submitted_at=datetime.now(UTC), file_key="two.pdf", mark=0,
            ),
        ])
        await db.commit()

    result = await client.get(
        "/api/v1/assessments/results/course",
        params={"student_id": str(seed.students[0].id), "course_id": str(seed.course.id)},
    )
    assert result.status_code == 200, result.text
    # Exam 80% × 70 plus assignment average 50% × 30 = 71%.
    assert result.json()["raw_score"] == 71


async def test_category_filter(client, seed):
    await client.post("/api/v1/assessments/assignments", json=_assignment_payload(seed, title="hw", category="homework"))
    await client.post("/api/v1/assessments/assignments", json=_assignment_payload(seed, title="test", category="test"))

    response = await client.get("/api/v1/assessments/assignments", params={"category": "test"})
    assert {row["title"] for row in response.json()} == {"test"}


@pytest.fixture
async def graded_section(db_sessionmaker, seed):
    """Grading scheme + one exam type + marks for both seeded students."""
    async with db_sessionmaker() as db:
        scheme = GradingScheme(
            madrasa_id=seed.madrasa.id,
            name="Default",
            bands=[
                {"label": "A", "min_score": 80, "max_score": 100},
                {"label": "B", "min_score": 60, "max_score": 79.99},
                {"label": "F", "min_score": 0, "max_score": 59.99},
            ],
        )
        db.add(scheme)
        await db.flush()
        exam = ExamType(
            madrasa_id=seed.madrasa.id,
            course_id=seed.course.id,
            name="Final",
            weightage=1.0,
            grading_scheme_id=scheme.id,
        )
        db.add(exam)
        await db.flush()
        db.add(Mark(exam_type_id=exam.id, student_id=seed.students[0].id, score=85))
        # students[1] is in section Bay — give a failing score there.
        db.add(Mark(exam_type_id=exam.id, student_id=seed.students[1].id, score=40))
        # Slot so the course→teacher summary resolves a name for section Alif.
        db.add(
            TimetableSlot(
                madrasa_id=seed.madrasa.id,
                session_id=seed.old_session.id,
                class_id=seed.class_a.id,
                section_id=seed.sections.a1.id,
                course_id=seed.course.id,
                teacher_id=seed.teacher.id,
                day_of_week=0,
                period=1,
                start_time="08:00",
                end_time="08:40",
            )
        )
        await db.commit()
    return exam


async def test_results_matrix_section(client, seed, graded_section):
    response = await client.get(
        "/api/v1/assessments/results/matrix", params={"section_id": str(seed.sections.a1.id)}
    )
    assert response.status_code == 200
    body = response.json()
    assert len(body["sections"]) == 1
    matrix = body["sections"][0]
    assert matrix["section_name"] == "Alif"
    assert matrix["courses"][0]["course_name"] == "Nazra"
    assert matrix["courses"][0]["teacher_name"] == "Ustad"
    [student] = matrix["students"]
    assert student["name"] == "Student 1"
    assert student["courses"][0]["raw_score"] == 85
    assert student["courses"][0]["band"] == "A"
    assert student["overall_score"] == 85


async def test_results_matrix_class_covers_all_sections(client, seed, graded_section):
    response = await client.get(
        "/api/v1/assessments/results/matrix", params={"class_id": str(seed.class_a.id)}
    )
    assert response.status_code == 200
    matrices = response.json()["sections"]
    assert {m["section_name"] for m in matrices} == {"Alif", "Bay"}


async def test_results_matrix_scope_denied_for_unrelated_teacher(teacher_client, seed, graded_section):
    # Seeded teacher teaches class A — section b1 of class B is out of scope.
    response = await teacher_client.get(
        "/api/v1/assessments/results/matrix", params={"section_id": str(seed.sections.b1.id)}
    )
    assert response.status_code == 403


async def test_results_matrix_requires_target(client):
    response = await client.get("/api/v1/assessments/results/matrix")
    assert response.status_code == 400


async def test_results_export_csv_has_teacher_summary(client, seed, graded_section):
    response = await client.get(
        "/api/v1/assessments/results/export",
        params={"section_id": str(seed.sections.a1.id), "format": "csv"},
    )
    assert response.status_code == 200
    text = response.text
    assert "Class 1 / Alif" in text
    assert "Student 1" in text
    assert "Nazra,Ustad" in text  # the course → teacher footer


async def test_results_export_pdf(client, seed, graded_section):
    response = await client.get(
        "/api/v1/assessments/results/export",
        params={"section_id": str(seed.sections.a1.id), "format": "pdf"},
    )
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert response.content[:4] == b"%PDF"
