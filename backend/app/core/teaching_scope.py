"""Derived teacher scope (IMPLEMENT.md §4).

The timetable is the source of truth for who teaches what: a teacher may act
on (class, section, course) iff a timetable slot for the session says so.
Legacy TeacherAssignment rows (class-level, no section) are honoured as a
second source so existing data keeps working while the Teacher Assignment tab
is phased out. Every helper returns the union of both sources.
"""
from dataclasses import dataclass
from typing import Optional
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.academics.models import TeacherAssignment
from app.modules.operations.models import TimetableSlot


@dataclass(frozen=True)
class TaughtPair:
    class_id: UUID
    course_id: UUID
    section_id: Optional[UUID]  # None = class-wide (legacy assignment rows)


async def taught_pairs(
    db: AsyncSession, *, madrasa_id: UUID, teacher_id: UUID, session_id: UUID
) -> list[TaughtPair]:
    slot_rows = (
        await db.execute(
            select(TimetableSlot.class_id, TimetableSlot.course_id, TimetableSlot.section_id)
            .where(
                TimetableSlot.madrasa_id == madrasa_id,
                TimetableSlot.teacher_id == teacher_id,
                TimetableSlot.session_id == session_id,
            )
            .distinct()
        )
    ).all()
    assignment_rows = (
        await db.execute(
            select(TeacherAssignment.class_id, TeacherAssignment.course_id)
            .where(
                TeacherAssignment.madrasa_id == madrasa_id,
                TeacherAssignment.teacher_id == teacher_id,
                TeacherAssignment.session_id == session_id,
            )
            .distinct()
        )
    ).all()
    pairs = {TaughtPair(class_id=c, course_id=k, section_id=s) for c, k, s in slot_rows}
    pairs |= {TaughtPair(class_id=c, course_id=k, section_id=None) for c, k in assignment_rows}
    return sorted(pairs, key=lambda p: (str(p.class_id), str(p.course_id), str(p.section_id)))


async def taught_class_ids(
    db: AsyncSession, *, madrasa_id: UUID, teacher_id: UUID, session_id: UUID
) -> set[UUID]:
    return {pair.class_id for pair in await taught_pairs(db, madrasa_id=madrasa_id, teacher_id=teacher_id, session_id=session_id)}


async def teacher_teaches(
    db: AsyncSession,
    *,
    madrasa_id: UUID,
    teacher_id: UUID,
    session_id: UUID,
    class_id: Optional[UUID] = None,
    course_id: Optional[UUID] = None,
    section_id: Optional[UUID] = None,
) -> bool:
    """True when any slot (or legacy assignment) matches every given filter.
    A class-wide legacy assignment satisfies any section of that class."""
    for pair in await taught_pairs(db, madrasa_id=madrasa_id, teacher_id=teacher_id, session_id=session_id):
        if class_id is not None and pair.class_id != class_id:
            continue
        if course_id is not None and pair.course_id != course_id:
            continue
        if section_id is not None and pair.section_id is not None and pair.section_id != section_id:
            continue
        return True
    return False
