from datetime import UTC, date, datetime

from app.modules.attendance.models import AttendanceStatus, StudentAttendance
from app.modules.operations.models import Holiday, Leave


async def _seed_slot(client):
    response = await client.get("/api/v1/operations/timetable")
    assert response.status_code == 200, response.text
    return response.json()[0]


async def test_period_attendance_round_trips_through_roster_sync_and_history(client, seed):
    slot = await _seed_slot(client)
    second_slot_response = await client.post(
        "/api/v1/operations/timetable",
        json={
            "class_id": str(seed.class_a.id),
            "section_id": str(seed.sections.a1.id),
            "course_id": str(seed.course.id),
            "teacher_id": str(seed.teacher.id),
            "day_of_week": 6,
            "period": 2,
            "start_time": "17:00",
            "end_time": "17:40",
        },
    )
    assert second_slot_response.status_code == 200, second_slot_response.text
    second_slot = second_slot_response.json()
    roster = await client.get(
        f"/api/v1/attendance/classes/{seed.class_a.id}/roster",
        params={
            "section_id": str(seed.sections.a1.id),
            "course_id": str(seed.course.id),
            "timetable_slot_id": slot["id"],
        },
    )
    assert roster.status_code == 200, roster.text
    assert roster.json()["course"] == {"id": str(seed.course.id), "name": "Nazra"}
    assert roster.json()["timetable_slot"]["id"] == slot["id"]
    assert [student["id"] for student in roster.json()["students"]] == [str(seed.students[0].id)]

    marked_at = datetime(2027, 1, 3, 9, 0, tzinfo=UTC)
    sync = await client.post(
        "/api/v1/attendance/sync",
        json={
            "entries": [
                {
                    "subject_type": "student",
                    "subject_id": str(seed.students[0].id),
                    "session_id": str(seed.old_session.id),
                    "attendance_date": "2027-01-03",
                    "status": "present",
                    "captured_at": marked_at.isoformat(),
                    "idempotency_key": "period-attendance-1",
                    "course_id": str(seed.course.id),
                    "timetable_slot_id": slot["id"],
                },
                {
                    "subject_type": "student",
                    "subject_id": str(seed.students[0].id),
                    "session_id": str(seed.old_session.id),
                    "attendance_date": "2027-01-03",
                    "status": "absent",
                    "captured_at": marked_at.isoformat(),
                    "idempotency_key": "period-attendance-2",
                    "course_id": str(seed.course.id),
                    "timetable_slot_id": second_slot["id"],
                },
            ]
        },
    )
    assert sync.status_code == 200, sync.text
    assert sync.json()["accepted"] == 2

    history = await client.get(
        f"/api/v1/attendance/classes/{seed.class_a.id}/students/{seed.students[0].id}/history",
        params={
            "section_id": str(seed.sections.a1.id),
            "start_date": "2027-01-03",
            "end_date": "2027-01-03",
        },
    )
    assert history.status_code == 200, history.text
    assert len(history.json()["entries"]) == 2
    entry = next(
        row for row in history.json()["entries"] if row["timetable_slot"]["id"] == slot["id"]
    )
    assert entry["course"] == {"id": str(seed.course.id), "name": "Nazra"}
    assert entry["timetable_slot"]["id"] == slot["id"]
    assert entry["legacy_general"] is False

    summary = await client.get(
        f"/api/v1/attendance/summary/student/{seed.students[0].id}",
        params={
            "start_date": "2027-01-03",
            "end_date": "2027-01-03",
            "course_id": str(seed.course.id),
        },
    )
    assert summary.status_code == 200, summary.text
    assert summary.json()["course_id"] == str(seed.course.id)
    assert summary.json()["present"] == 1
    assert summary.json()["absent"] == 1


async def test_legacy_general_attendance_remains_accepted_and_labeled(client, seed):
    sync = await client.post(
        "/api/v1/attendance/sync",
        json={
            "entries": [
                {
                    "subject_type": "student",
                    "subject_id": str(seed.students[0].id),
                    "session_id": str(seed.old_session.id),
                    "attendance_date": "2027-01-04",
                    "status": "absent",
                    "captured_at": "2027-01-04T09:00:00Z",
                    "idempotency_key": "legacy-general-attendance-1",
                }
            ]
        },
    )
    assert sync.status_code == 200, sync.text
    assert sync.json()["accepted"] == 1

    history = await client.get(
        f"/api/v1/attendance/classes/{seed.class_a.id}/students/{seed.students[0].id}/history",
        params={
            "section_id": str(seed.sections.a1.id),
            "start_date": "2027-01-04",
            "end_date": "2027-01-04",
        },
    )
    assert history.status_code == 200, history.text
    assert history.json()["entries"][0]["legacy_general"] is True
    assert history.json()["entries"][0]["course"] is None
    assert history.json()["entries"][0]["timetable_slot"] is None


async def test_period_attendance_rejects_slot_outside_student_section(client, seed):
    slot = await _seed_slot(client)
    response = await client.post(
        "/api/v1/attendance/sync",
        json={
            "entries": [
                {
                    "subject_type": "student",
                    "subject_id": str(seed.students[1].id),
                    "session_id": str(seed.old_session.id),
                    "attendance_date": "2027-01-03",
                    "status": "present",
                    "captured_at": "2027-01-03T09:00:00Z",
                    "idempotency_key": "wrong-section-period",
                    "course_id": str(seed.course.id),
                    "timetable_slot_id": slot["id"],
                }
            ]
        },
    )
    assert response.status_code == 403
    assert response.json()["detail"] == "attendance_slot_not_assigned"


async def test_teacher_period_roster_matches_principal_for_assigned_section(
    client, teacher_client, seed,
):
    slot = await _seed_slot(client)
    principal = await client.get(
        f"/api/v1/attendance/classes/{seed.class_a.id}/roster",
        params={
            "section_id": str(seed.sections.a1.id),
            "course_id": str(seed.course.id),
            "timetable_slot_id": slot["id"],
        },
    )
    teacher = await teacher_client.get(
        f"/api/v1/attendance/classes/{seed.class_a.id}/roster",
        params={
            "section_id": str(seed.sections.a1.id),
            "course_id": str(seed.course.id),
            "timetable_slot_id": slot["id"],
        },
    )
    assert principal.status_code == teacher.status_code == 200
    assert teacher.json()["students"] == principal.json()["students"]


async def test_enrollment_change_preserves_history_and_unassigns_explicitly(client, seed, db_sessionmaker):
    student_before = await client.get(f"/api/v1/people/students/{seed.students[0].id}")
    assert student_before.status_code == 200, student_before.text
    assert student_before.json()["active_enrollment"]["section_name"] == "Alif"

    changed = await client.post(
        "/api/v1/academics/students/enroll",
        json={
            "student_id": str(seed.students[0].id),
            "session_id": str(seed.old_session.id),
            "program_id": str(seed.program.id),
            "class_id": str(seed.class_a.id),
            "section_id": str(seed.sections.a2.id),
            "effective_date": "2024-08-01",
        },
    )
    assert changed.status_code == 200, changed.text
    assert changed.json()["active_enrollment"]["section_id"] == str(seed.sections.a2.id)

    student_after_move = await client.get(f"/api/v1/people/students/{seed.students[0].id}")
    assert student_after_move.status_code == 200, student_after_move.text
    assert student_after_move.json()["active_enrollment"]["section_name"] == "Bay"

    history = await client.get(
        f"/api/v1/academics/students/{seed.students[0].id}/enrollments",
        params={"session_id": str(seed.old_session.id)},
    )
    assert history.status_code == 200, history.text
    assert len(history.json()) == 2
    assert history.json()[0]["ended_on"] == "2024-07-31"
    assert history.json()[0]["is_active"] is False
    assert history.json()[1]["started_on"] == "2024-08-01"
    assert history.json()[1]["is_active"] is True

    # Insert immutable historical facts directly: the public sync endpoint
    # correctly locks past dates, while this regression is about read-time
    # attribution after a section transfer.
    async with db_sessionmaker() as db:
        db.add_all([
            StudentAttendance(
                madrasa_id=seed.madrasa.id,
                student_id=seed.students[0].id,
                session_id=seed.old_session.id,
                attendance_date=date(2024, 7, 15),
                status=AttendanceStatus.present,
                marked_at=datetime(2024, 7, 15, 9, 0, tzinfo=UTC),
                marked_by_id=seed.principal.id,
                idempotency_key="history-before-section-transfer",
            ),
            StudentAttendance(
                madrasa_id=seed.madrasa.id,
                student_id=seed.students[0].id,
                session_id=seed.old_session.id,
                attendance_date=date(2024, 8, 15),
                status=AttendanceStatus.absent,
                marked_at=datetime(2024, 8, 15, 9, 0, tzinfo=UTC),
                marked_by_id=seed.principal.id,
                idempotency_key="history-after-section-transfer",
            ),
        ])
        await db.commit()

    old_section_history = await client.get(
        f"/api/v1/attendance/classes/{seed.class_a.id}/students/{seed.students[0].id}/history",
        params={
            "section_id": str(seed.sections.a1.id),
            "start_date": "2024-07-01",
            "end_date": "2024-08-31",
        },
    )
    assert old_section_history.status_code == 200, old_section_history.text
    assert [row["attendance_date"] for row in old_section_history.json()["entries"]] == ["2024-07-15"]

    new_section_history = await client.get(
        f"/api/v1/attendance/classes/{seed.class_a.id}/students/{seed.students[0].id}/history",
        params={
            "section_id": str(seed.sections.a2.id),
            "start_date": "2024-07-01",
            "end_date": "2024-08-31",
        },
    )
    assert new_section_history.status_code == 200, new_section_history.text
    assert [row["attendance_date"] for row in new_section_history.json()["entries"]] == ["2024-08-15"]

    async with db_sessionmaker() as db:
        db.add(Leave(
            madrasa_id=seed.madrasa.id,
            user_id=seed.students[0].user_id,
            start_date=date(2024, 7, 30),
            end_date=date(2024, 8, 2),
            reason="Family travel",
            status="approved",
        ))
        await db.commit()

    old_section_with_leave = await client.get(
        f"/api/v1/attendance/classes/{seed.class_a.id}/students/{seed.students[0].id}/history",
        params={"section_id": str(seed.sections.a1.id), "start_date": "2024-07-30", "end_date": "2024-08-02"},
    )
    new_section_with_leave = await client.get(
        f"/api/v1/attendance/classes/{seed.class_a.id}/students/{seed.students[0].id}/history",
        params={"section_id": str(seed.sections.a2.id), "start_date": "2024-07-30", "end_date": "2024-08-02"},
    )
    assert [row["attendance_date"] for row in old_section_with_leave.json()["entries"]] == ["2024-07-31", "2024-07-30"]
    assert [row["attendance_date"] for row in new_section_with_leave.json()["entries"]] == ["2024-08-02", "2024-08-01"]

    unassigned = await client.delete(
        f"/api/v1/academics/students/{seed.students[0].id}/enrollments/{seed.old_session.id}",
        params={"effective_date": "2024-09-01"},
    )
    assert unassigned.status_code == 200, unassigned.text
    assert unassigned.json() == {"status": "success", "ended_on": "2024-08-31"}

    student_after_unassign = await client.get(f"/api/v1/people/students/{seed.students[0].id}")
    assert student_after_unassign.status_code == 200, student_after_unassign.text
    assert student_after_unassign.json()["active_enrollment"] is None

    roster = await client.get(
        f"/api/v1/attendance/classes/{seed.class_a.id}/roster",
        params={"section_id": str(seed.sections.a2.id)},
    )
    assert roster.status_code == 200, roster.text
    assert str(seed.students[0].id) not in {row["id"] for row in roster.json()["students"]}

    repeated = await client.delete(
        f"/api/v1/academics/students/{seed.students[0].id}/enrollments/{seed.old_session.id}",
        params={"effective_date": "2024-09-01"},
    )
    assert repeated.status_code == 404


async def test_historical_summary_preserves_explicit_class_scope(seed, db_sessionmaker):
    from app.modules.attendance.routes import compute_attendance_summary

    async with db_sessionmaker() as db:
        db.add(Holiday(
            madrasa_id=seed.madrasa.id,
            name="Class B closure",
            start_date=date(2024, 7, 10),
            end_date=date(2024, 7, 10),
            class_ids=[str(seed.class_b.id)],
        ))
        await db.commit()
        summary = await compute_attendance_summary(
            db,
            seed.madrasa.id,
            "student",
            seed.students[0].id,
            date(2024, 7, 10),
            date(2024, 7, 10),
            class_id=seed.class_b.id,
            section_id=seed.sections.b1.id,
        )
    assert summary.excluded_days == 1
    assert summary.days[0].excluded_reason == "holiday"
