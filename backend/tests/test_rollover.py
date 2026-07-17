"""Session rollover: students must move into the mapped next class, landing in
sections that belong to that class (regression for the cross-class section bug
and the missing-madrasa_id NOT NULL 500)."""
from uuid import UUID, uuid4

from sqlalchemy import select

from app.modules.academics.models import AcademicSession, Enrollment, Section
from app.modules.operations.models import TimetableSlot


def rollover_payload(seed, **overrides):
    payload = {
        "name": "2025-26",
        "gregorian_start": "2025-04-01",
        "gregorian_end": "2026-03-31",
        "hijri_span": "1446-47",
        "class_mappings": [
            {"current_class_id": str(seed.class_a.id), "next_class_id": str(seed.class_b.id)}
        ],
        "copy_timetable": True,
    }
    payload.update(overrides)
    return payload


async def test_rollover_moves_students_into_next_class_sections(client, db_sessionmaker, seed):
    response = await client.post(
        f"/api/v1/academics/sessions/{seed.old_session.id}/rollover",
        json=rollover_payload(seed),
    )
    assert response.status_code == 200, response.text
    new_session_id = UUID(response.json()["id"])

    async with db_sessionmaker() as db:
        enrollments = (
            await db.execute(select(Enrollment).where(Enrollment.session_id == new_session_id))
        ).scalars().all()
        assert len(enrollments) == 2
        for enrollment in enrollments:
            assert enrollment.madrasa_id == seed.madrasa.id
            assert enrollment.class_id == seed.class_b.id
            section = await db.get(Section, enrollment.section_id)
            assert section is not None
            assert section.class_id == seed.class_b.id

        # Sections are matched by name across classes.
        by_student = {e.student_id: e.section_id for e in enrollments}
        assert by_student[seed.students[0].id] == seed.sections.b1.id  # Alif -> Alif
        assert by_student[seed.students[1].id] == seed.sections.b2.id  # Bay -> Bay

        slots = (
            await db.execute(
                select(TimetableSlot).where(TimetableSlot.session_id == new_session_id)
            )
        ).scalars().all()
        assert len(slots) == 1
        assert slots[0].madrasa_id == seed.madrasa.id

        old_session = await db.get(AcademicSession, seed.old_session.id)
        new_session = await db.get(AcademicSession, new_session_id)
        assert old_session.is_active is False
        assert new_session.is_active is True


async def test_rollover_falls_back_to_first_section_when_names_differ(client, db_sessionmaker, seed):
    async with db_sessionmaker() as db:
        section_b1 = await db.get(Section, seed.sections.b1.id)
        section_b2 = await db.get(Section, seed.sections.b2.id)
        section_b1.name = "Jeem"
        section_b2.name = "Zay"
        await db.commit()

    response = await client.post(
        f"/api/v1/academics/sessions/{seed.old_session.id}/rollover",
        json=rollover_payload(seed),
    )
    assert response.status_code == 200, response.text
    new_session_id = UUID(response.json()["id"])

    async with db_sessionmaker() as db:
        enrollments = (
            await db.execute(select(Enrollment).where(Enrollment.session_id == new_session_id))
        ).scalars().all()
        assert len(enrollments) == 2
        # No name match anywhere -> first section of the next class ("Jeem").
        assert {e.section_id for e in enrollments} == {seed.sections.b1.id}


async def test_rollover_conflicts_when_next_class_has_no_sections(client, db_sessionmaker, seed):
    async with db_sessionmaker() as db:
        for section_id in (seed.sections.b1.id, seed.sections.b2.id):
            section = await db.get(Section, section_id)
            await db.delete(section)
        await db.commit()

    response = await client.post(
        f"/api/v1/academics/sessions/{seed.old_session.id}/rollover",
        json=rollover_payload(seed),
    )
    assert response.status_code == 409
    assert "section" in response.json()["detail"].lower()


async def test_rollover_unknown_session_is_404(client, seed):
    response = await client.post(
        f"/api/v1/academics/sessions/{uuid4()}/rollover",
        json=rollover_payload(seed),
    )
    assert response.status_code == 404


async def test_rollover_can_start_with_a_fresh_timetable(client, db_sessionmaker, seed):
    response = await client.post(
        f"/api/v1/academics/sessions/{seed.old_session.id}/rollover",
        json=rollover_payload(seed, copy_timetable=False),
    )
    assert response.status_code == 200, response.text
    new_session_id = UUID(response.json()["id"])

    async with db_sessionmaker() as db:
        slots = (
            await db.execute(
                select(TimetableSlot).where(TimetableSlot.session_id == new_session_id)
            )
        ).scalars().all()
        assert slots == []
