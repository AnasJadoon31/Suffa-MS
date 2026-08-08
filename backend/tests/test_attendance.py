"""Attendance endpoints against the active session (regression for the stale
Course.class_id reference that 500'd /attendance/classes after the
course/class decoupling refactor)."""

from datetime import UTC, datetime

from sqlalchemy import select

from app.modules.attendance.models import AttendanceCorrection


async def test_attendance_classes_lists_counts_and_courses(client, seed):
    response = await client.get("/api/v1/attendance/classes")
    assert response.status_code == 200, response.text
    by_id = {entry["id"]: entry for entry in response.json()}

    class_a = by_id[str(seed.class_a.id)]
    assert class_a["student_count"] == 2
    assert class_a["course_names"] == ["Nazra"]

    class_b = by_id[str(seed.class_b.id)]
    assert class_b["student_count"] == 0
    assert class_b["course_names"] == ["Nazra"]


async def test_attendance_roster_resolves_sections(client, seed):
    response = await client.get(f"/api/v1/attendance/classes/{seed.class_a.id}/roster")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["session_id"] == str(seed.old_session.id)
    assert len(body["students"]) == 2
    assert sorted(s["section_name"] for s in body["students"]) == ["Alif", "Bay"]


async def test_attendance_follows_session_rollover(client, seed):
    rollover = await client.post(
        f"/api/v1/academics/sessions/{seed.old_session.id}/rollover",
        json={
            "name": "2025-26",
            "gregorian_start": "2025-04-01",
            "gregorian_end": "2026-03-31",
            "hijri_span": "1446-47",
            "class_mappings": [
                {"current_class_id": str(seed.class_a.id), "next_class_id": str(seed.class_b.id)}
            ],
            "copy_teacher_assignments": True,
        },
    )
    assert rollover.status_code == 200, rollover.text
    new_session_id = rollover.json()["id"]

    classes = await client.get("/api/v1/attendance/classes")
    assert classes.status_code == 200, classes.text
    by_id = {entry["id"]: entry for entry in classes.json()}
    assert by_id[str(seed.class_b.id)]["student_count"] == 2
    assert by_id[str(seed.class_a.id)]["student_count"] == 0

    roster = await client.get(f"/api/v1/attendance/classes/{seed.class_b.id}/roster")
    assert roster.status_code == 200, roster.text
    body = roster.json()
    assert body["session_id"] == new_session_id
    assert len(body["students"]) == 2
    assert {s["section_id"] for s in body["students"]} == {
        str(seed.sections.b1.id),
        str(seed.sections.b2.id),
    }


async def test_teacher_sees_only_assigned_classes(teacher_client, seed):
    response = await teacher_client.get("/api/v1/attendance/classes")
    assert response.status_code == 200, response.text
    ids = [entry["id"] for entry in response.json()]
    assert ids == [str(seed.class_a.id)]


async def test_admin_can_correct_student_attendance_history(client, db_session, seed):
    attendance_date = "2024-04-08"
    first_payload = {
        "entry": {
            "subject_type": "student",
            "subject_id": str(seed.students[0].id),
            "session_id": str(seed.old_session.id),
            "attendance_date": attendance_date,
            "status": "absent",
            "captured_at": datetime(2024, 4, 8, 8, 0, tzinfo=UTC).isoformat(),
            "idempotency_key": f"{seed.students[0].id}:{seed.old_session.id}:{attendance_date}:general",
        },
        "reason": "Initial historical import",
    }
    created = await client.post("/api/v1/attendance/override", json=first_payload)
    assert created.status_code == 200, created.text

    correction_payload = {
        "entry": {
            **first_payload["entry"],
            "status": "present",
            "captured_at": datetime(2024, 4, 8, 9, 0, tzinfo=UTC).isoformat(),
        },
        "reason": "Admin corrected student history",
    }
    corrected = await client.post("/api/v1/attendance/override", json=correction_payload)
    assert corrected.status_code == 200, corrected.text

    history = await client.get(
        f"/api/v1/attendance/classes/{seed.class_a.id}/students/{seed.students[0].id}/history",
        params={"start_date": attendance_date, "end_date": attendance_date},
    )
    assert history.status_code == 200, history.text
    entries = history.json()["entries"]
    assert len(entries) == 1
    assert entries[0]["status"] == "present"
    assert entries[0]["overridden"] is True
    assert entries[0]["marked_by"]["username"] == "principal"

    corrections = (
        await db_session.execute(
            select(AttendanceCorrection).where(AttendanceCorrection.attendance_table == "student_attendance")
        )
    ).scalars().all()
    assert len(corrections) == 1
    assert corrections[0].reason == "Admin corrected student history"


async def test_teacher_cannot_override_student_attendance_history(teacher_client, seed):
    payload = {
        "entry": {
            "subject_type": "student",
            "subject_id": str(seed.students[0].id),
            "session_id": str(seed.old_session.id),
            "attendance_date": "2024-04-08",
            "status": "present",
            "captured_at": datetime(2024, 4, 8, 9, 0, tzinfo=UTC).isoformat(),
            "idempotency_key": f"{seed.students[0].id}:{seed.old_session.id}:2024-04-08:general",
        },
        "reason": "Teacher attempted history correction",
    }
    response = await teacher_client.post("/api/v1/attendance/override", json=payload)
    assert response.status_code == 403
