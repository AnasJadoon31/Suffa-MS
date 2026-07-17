"""Self-service portal endpoints for teachers/students.

Teacher and student portals reuse the existing PATCH /auth/me and
POST /auth/change-password endpoints directly (already covered elsewhere);
this file covers the one new minimal addition — GET /finance/salary/me.
"""
from datetime import UTC, date, datetime

import pytest
from sqlalchemy import select

from app.main import app as fastapi_app
from app.modules.attendance.models import AttendanceStatus, StudentAttendance
from app.modules.auth.models import User, UserPermission
from app.modules.operations.models import TimetableSlot
from tests.conftest import _make_client


@pytest.fixture
async def student_client(db_sessionmaker, seed):
    async with db_sessionmaker() as db:
        student_user = (await db.execute(select(User).where(User.username == "student1"))).scalar_one()
    async_client = _make_client(db_sessionmaker, seed, student_user)
    async with async_client:
        yield async_client
    fastapi_app.dependency_overrides.clear()


async def test_teacher_sees_own_salary_record_and_payments(client, teacher_client, seed):
    # Principal sets the salary and records a payment...
    set_response = await client.put(
        f"/api/v1/finance/salary/{seed.teacher.id}",
        json={"amount": 45000, "currency": "PKR", "effective_from": "2024-04-01"},
    )
    assert set_response.status_code == 200, set_response.text

    payment_response = await client.post(
        f"/api/v1/finance/salary/{seed.teacher.id}/payments",
        json={
            "amount": 45000, "currency": "PKR", "payment_date": "2024-05-01",
            "period_covered": "April 2024", "method": "cash", "note": "",
        },
    )
    assert payment_response.status_code == 200, payment_response.text

    # ...and the teacher can read it back via the self-scoped endpoint,
    # without holding teachers.salary.manage.
    response = await teacher_client.get("/api/v1/finance/salary/me")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["record"]["amount"] == 45000.0
    assert len(body["payments"]) == 1
    assert body["payments"][0]["period_covered"] == "April 2024"


async def test_teacher_with_no_salary_record_gets_empty_response(client, teacher_client, seed):
    response = await teacher_client.get("/api/v1/finance/salary/me")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["record"] is None
    assert body["payments"] == []


async def test_teacher_cannot_read_another_teachers_salary_without_permission(teacher_client, seed):
    response = await teacher_client.get(f"/api/v1/finance/salary/{seed.teacher.id}")
    assert response.status_code == 403, response.text


async def test_non_teacher_account_is_rejected_from_my_salary(client, seed):
    # `client` is authenticated as the principal, who has no TeacherProfile.
    response = await client.get("/api/v1/finance/salary/me")
    assert response.status_code == 403, response.text


async def test_student_attendance_self_route_returns_only_authenticated_student(student_client, db_sessionmaker, seed):
    async with db_sessionmaker() as db:
        for index, student in enumerate(seed.students, start=1):
            db.add(StudentAttendance(
                madrasa_id=seed.madrasa.id,
                student_id=student.id,
                session_id=seed.old_session.id,
                attendance_date=date(2024, 5, index),
                status=AttendanceStatus.present if index == 1 else AttendanceStatus.absent,
                marked_at=datetime(2024, 5, index, 8, tzinfo=UTC),
                marked_by_id=seed.principal.id,
                idempotency_key=f"self-route-{index}",
            ))
        await db.commit()

    response = await student_client.get("/api/v1/attendance/students/me/history")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["student"]["id"] == str(seed.students[0].id)
    assert [entry["student_id"] for entry in body["entries"]] == [str(seed.students[0].id)]


async def test_student_my_timetable_is_scoped_to_own_section(student_client, db_sessionmaker, seed):
    async with db_sessionmaker() as db:
        db.add_all([
            TimetableSlot(
                madrasa_id=seed.madrasa.id, session_id=seed.old_session.id,
                class_id=seed.class_a.id, section_id=seed.sections.a1.id,
                course_id=seed.course.id, teacher_id=seed.teacher.id,
                day_of_week=0, period=1, start_time="08:00", end_time="08:40",
            ),
            TimetableSlot(
                madrasa_id=seed.madrasa.id, session_id=seed.old_session.id,
                class_id=seed.class_a.id, section_id=seed.sections.a2.id,
                course_id=seed.course.id, teacher_id=seed.teacher.id,
                day_of_week=0, period=2, start_time="08:40", end_time="09:20",
            ),
        ])
        await db.commit()

    response = await student_client.get("/api/v1/operations/timetable/me")
    assert response.status_code == 200, response.text
    rows = response.json()
    assert rows
    assert {row["section_id"] for row in rows} == {str(seed.sections.a1.id)}
    assert {row["course_name"] for row in rows} == {"Nazra"}


async def test_non_student_cannot_use_student_attendance_self_route(teacher_client):
    response = await teacher_client.get("/api/v1/attendance/students/me/history")
    assert response.status_code == 403


async def test_principal_cannot_use_timetable_self_route(client):
    response = await client.get("/api/v1/operations/timetable/me")
    assert response.status_code == 403


async def test_my_leave_forces_self_scope_even_with_manage_permission(
    client, teacher_client, db_sessionmaker, seed,
):
    await client.post("/api/v1/operations/leave", json={
        "user_id": str(seed.students[0].user_id), "start_date": "2024-06-01", "end_date": "2024-06-01",
    })
    await teacher_client.post("/api/v1/operations/leave", json={
        "start_date": "2024-06-02", "end_date": "2024-06-02",
    })
    async with db_sessionmaker() as db:
        db.add(UserPermission(
            user_id=seed.teacher_user.id,
            permission_code="leave.manage",
            granted_by_id=seed.principal.id,
        ))
        await db.commit()

    response = await teacher_client.get("/api/v1/operations/leave", params={"self_only": True})
    assert response.status_code == 200, response.text
    assert [row["user_id"] for row in response.json()] == [str(seed.teacher_user.id)]


async def test_timetable_permission_does_not_allow_managing_other_peoples_leave(
    teacher_client, db_sessionmaker, seed,
):
    async with db_sessionmaker() as db:
        db.add(UserPermission(
            user_id=seed.teacher_user.id,
            permission_code="timetable.manage",
            granted_by_id=seed.principal.id,
        ))
        await db.commit()
    response = await teacher_client.post("/api/v1/operations/leave", json={
        "user_id": str(seed.students[0].user_id), "start_date": "2024-06-03", "end_date": "2024-06-03",
    })
    assert response.status_code == 403
