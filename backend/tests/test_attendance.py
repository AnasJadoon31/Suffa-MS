"""Attendance endpoints against the active session (regression for the stale
Course.class_id reference that 500'd /attendance/classes after the
course/class decoupling refactor)."""


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
