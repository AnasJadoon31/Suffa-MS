"""Timetable as source of truth for teacher scope (§4 of IMPLEMENT.md).

Covers: session stamping + conflict detection + auto-period on slot create,
name-enriched slot listing, and the derived-access rule — a timetable slot
(with no TeacherAssignment row) is enough for a teacher to act on that
class+course in assessments.
"""
from sqlalchemy import select

from app.modules.academics.models import TeacherAssignment
from app.modules.auth.models import User, UserPermission, UserRole, UserStatus
from app.modules.operations.models import TimetableSlot
from app.modules.people.models import TeacherProfile


def _slot_payload(seed, **overrides):
    payload = {
        "class_id": str(seed.class_a.id),
        "section_id": str(seed.sections.a1.id),
        "course_id": str(seed.course.id),
        "teacher_id": str(seed.teacher.id),
        "day_of_week": 0,
        "start_time": "08:00",
        "end_time": "08:40",
    }
    payload.update(overrides)
    return payload


async def test_slot_create_stamps_active_session(client, seed):
    response = await client.post("/api/v1/operations/timetable", json=_slot_payload(seed))
    assert response.status_code == 200
    body = response.json()
    assert body["session_id"] == str(seed.old_session.id)
    assert body["period"] == 1  # auto-derived: first slot of the day


async def test_slot_create_rejects_section_of_other_class(client, seed):
    response = await client.post(
        "/api/v1/operations/timetable",
        json=_slot_payload(seed, section_id=str(seed.sections.b1.id)),
    )
    assert response.status_code == 400


async def test_slot_conflicts_teacher_and_section(client, seed):
    first = await client.post("/api/v1/operations/timetable", json=_slot_payload(seed))
    assert first.status_code == 200

    # Same teacher, other section, overlapping time → 409.
    teacher_clash = await client.post(
        "/api/v1/operations/timetable",
        json=_slot_payload(seed, section_id=str(seed.sections.a2.id), start_time="08:20", end_time="09:00"),
    )
    assert teacher_clash.status_code == 409

    # Back-to-back is fine, and the auto-period increments.
    ok = await client.post(
        "/api/v1/operations/timetable",
        json=_slot_payload(seed, start_time="08:40", end_time="09:20"),
    )
    assert ok.status_code == 200
    assert ok.json()["period"] == 2


async def test_timetable_list_is_name_enriched(client, seed):
    await client.post("/api/v1/operations/timetable", json=_slot_payload(seed))
    response = await client.get("/api/v1/operations/timetable")
    assert response.status_code == 200
    row = response.json()[0]
    assert row["class_name"] == "Class 1"
    assert row["section_name"] == "Alif"
    assert row["course_name"] == "Nazra"
    assert row["teacher_name"] == "Ustad"


async def test_teacher_with_manage_grant_still_lists_only_own_timetable(
    teacher_client, seed, db_sessionmaker,
):
    async with db_sessionmaker() as db:
        other_user = User(
            madrasa_id=seed.madrasa.id,
            username="teacher2",
            password_hash="x",
            role=UserRole.teacher,
            status=UserStatus.active,
        )
        db.add(other_user)
        await db.flush()
        other_teacher = TeacherProfile(
            madrasa_id=seed.madrasa.id,
            user_id=other_user.id,
            name="Other teacher",
            employee_code="T2",
            status="active",
            whatsapp_number="+920000000001",
        )
        db.add(other_teacher)
        await db.flush()
        db.add_all([
            UserPermission(
                user_id=seed.teacher_user.id,
                permission_code="timetable.manage",
                granted_by_id=seed.principal.id,
            ),
            TimetableSlot(
                madrasa_id=seed.madrasa.id,
                session_id=seed.old_session.id,
                class_id=seed.class_b.id,
                section_id=seed.sections.b1.id,
                course_id=seed.course.id,
                teacher_id=other_teacher.id,
                day_of_week=1,
                period=1,
                start_time="09:00",
                end_time="09:40",
            ),
        ])
        await db.commit()

    response = await teacher_client.get("/api/v1/operations/timetable")

    assert response.status_code == 200
    assert {row["teacher_id"] for row in response.json()} == {str(seed.teacher.id)}


async def test_slot_alone_grants_assessment_scope(client, teacher_client, seed, db_sessionmaker):
    """Teacher has no TeacherAssignment for class_b — a timetable slot must be
    enough to create an assignment there (derived access, §4)."""
    async with db_sessionmaker() as db:
        db.add(
            UserPermission(
                user_id=seed.teacher_user.id,
                permission_code="assignments.create",
                granted_by_id=seed.principal.id,
            )
        )
        db.add(
            TimetableSlot(
                madrasa_id=seed.madrasa.id,
                session_id=seed.old_session.id,
                class_id=seed.class_b.id,
                section_id=seed.sections.b1.id,
                course_id=seed.course.id,
                teacher_id=seed.teacher.id,
                day_of_week=1,
                period=1,
                start_time="09:00",
                end_time="09:40",
            )
        )
        await db.commit()

    assignment = {
        "class_id": str(seed.class_b.id),
        "course_id": str(seed.course.id),
        "title": "Sabaq revision",
        "instructions": "Revise lesson 4",
        "due_date": "2024-07-01T00:00:00Z",
    }
    response = await teacher_client.post("/api/v1/assessments/assignments", json=assignment)
    assert response.status_code == 200, response.text

    # …but not for a class the teacher neither teaches nor is assigned to.
    async with db_sessionmaker() as db:
        slot = (
            await db.execute(select(TimetableSlot).where(TimetableSlot.class_id == seed.class_b.id))
        ).scalar_one()
        await db.delete(slot)
        await db.commit()

    denied = await teacher_client.post("/api/v1/assessments/assignments", json=assignment)
    assert denied.status_code == 403


async def test_legacy_teacher_assignment_does_not_grant_teaching_scope(
    teacher_client, seed, db_sessionmaker,
):
    async with db_sessionmaker() as db:
        db.add_all([
            UserPermission(
                user_id=seed.teacher_user.id,
                permission_code="assignments.create",
                granted_by_id=seed.principal.id,
            ),
            TeacherAssignment(
                madrasa_id=seed.madrasa.id,
                teacher_id=seed.teacher.id,
                session_id=seed.old_session.id,
                class_id=seed.class_b.id,
                course_id=seed.course.id,
            ),
        ])
        await db.commit()

    response = await teacher_client.post(
        "/api/v1/assessments/assignments",
        json={
            "class_id": str(seed.class_b.id),
            "course_id": str(seed.course.id),
            "title": "Legacy scope must not pass",
            "instructions": "Use the timetable",
            "due_date": "2024-07-01T00:00:00Z",
        },
    )

    assert response.status_code == 403
