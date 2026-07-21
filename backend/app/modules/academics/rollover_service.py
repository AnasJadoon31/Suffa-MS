import uuid
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException
from .models import AcademicSession, Enrollment, Section
from .schemas import SessionRolloverRequest


async def _next_section_resolver(
    session: AsyncSession,
    madrasa_id: uuid.UUID,
    next_class_ids: set[uuid.UUID],
) -> "callable":
    """Sections belong to a class, so an enrollment moved to the next class
    must land in one of *that* class's sections. Match the old section by
    name first; otherwise fall back to the next class's first section."""
    result = await session.execute(
        select(Section).where(
            Section.madrasa_id == madrasa_id,
            Section.class_id.in_(next_class_ids),
        )
    )
    by_class: dict[uuid.UUID, list[Section]] = {}
    for record in result.scalars().all():
        by_class.setdefault(record.class_id, []).append(record)
    for sections in by_class.values():
        sections.sort(key=lambda s: s.name)

    def resolve(next_class_id: uuid.UUID, old_section_name: str | None) -> uuid.UUID | None:
        sections = by_class.get(next_class_id)
        if not sections:
            return None
        if old_section_name is not None:
            for candidate in sections:
                if candidate.name.casefold() == old_section_name.casefold():
                    return candidate.id
        return sections[0].id

    return resolve

async def perform_rollover(
    session: AsyncSession,
    madrasa_id: uuid.UUID,
    current_session_id: uuid.UUID,
    payload: SessionRolloverRequest
) -> AcademicSession:
    
    # Verify current session exists
    current_session = await session.get(AcademicSession, current_session_id)
    if not current_session or current_session.madrasa_id != madrasa_id:
        raise HTTPException(status_code=404, detail="Current session not found")
        
    # Deactivate all sessions
    deact_stmt = select(AcademicSession).where(
        AcademicSession.madrasa_id == madrasa_id, 
        AcademicSession.is_active.is_(True)
    )
    deact_result = await session.execute(deact_stmt)
    for record in deact_result.scalars().all():
        record.is_active = False
    
    # Create new session
    new_session = AcademicSession(
        madrasa_id=madrasa_id,
        name=payload.name,
        gregorian_start=payload.gregorian_start,
        gregorian_end=payload.gregorian_end,
        hijri_span=payload.hijri_span,
        is_active=True
    )
    session.add(new_session)
    await session.flush()
    
    mapping_dict = {m.current_class_id: m.next_class_id for m in payload.class_mappings}
    next_class_ids = {c for c in mapping_dict.values() if c is not None}

    # Fetch all enrollments in the current session
    enrollments_stmt = select(Enrollment).where(
        Enrollment.session_id == current_session_id,
        Enrollment.ended_on.is_(None),
    )
    enrollments_result = await session.execute(enrollments_stmt)
    old_enrollments = enrollments_result.scalars().all()

    resolve_section = await _next_section_resolver(session, madrasa_id, next_class_ids)
    old_section_ids = {e.section_id for e in old_enrollments if e.section_id is not None}
    old_section_names: dict[uuid.UUID, str] = {}
    if old_section_ids:
        old_sections_result = await session.execute(
            select(Section.id, Section.name).where(Section.id.in_(old_section_ids))
        )
        old_section_names = dict(old_sections_result.all())

    for old_enrollment in old_enrollments:
        if old_enrollment.class_id in mapping_dict:
            next_class_id = mapping_dict[old_enrollment.class_id]
            if next_class_id is not None:
                next_section_id = resolve_section(
                    next_class_id, old_section_names.get(old_enrollment.section_id)
                )
                if next_section_id is None:
                    raise HTTPException(
                        status_code=409,
                        detail="Next class has no sections; create at least one section in every target class before rollover",
                    )
                new_enrollment = Enrollment(
                    madrasa_id=madrasa_id,
                    student_id=old_enrollment.student_id,
                    session_id=new_session.id,
                    program_id=old_enrollment.program_id,
                    class_id=next_class_id,
                    section_id=next_section_id,
                    started_on=new_session.gregorian_start,
                )
                session.add(new_enrollment)
                
    if payload.copy_timetable:
        # Timetables belong to classes, which persist across sessions — copy
        # slots verbatim under the new session id (IMPLEMENT.md §10).
        from app.modules.operations.models import TimetableSlot

        slots = (
            await session.execute(
                select(TimetableSlot).where(
                    TimetableSlot.madrasa_id == madrasa_id,
                    TimetableSlot.session_id == current_session_id,
                )
            )
        ).scalars().all()
        for slot in slots:
            session.add(
                TimetableSlot(
                    madrasa_id=madrasa_id,
                    session_id=new_session.id,
                    class_id=slot.class_id,
                    section_id=slot.section_id,
                    course_id=slot.course_id,
                    teacher_id=slot.teacher_id,
                    day_of_week=slot.day_of_week,
                    period=slot.period,
                    start_time=slot.start_time,
                    end_time=slot.end_time,
                )
            )

    if payload.copy_holidays:
        from app.modules.operations.models import Holiday

        shift = (
            new_session.gregorian_start - current_session.gregorian_start
            if payload.shift_holiday_dates
            else None
        )
        holidays = (
            await session.execute(
                select(Holiday).where(
                    Holiday.madrasa_id == madrasa_id,
                    Holiday.start_date >= current_session.gregorian_start,
                    Holiday.end_date <= current_session.gregorian_end,
                )
            )
        ).scalars().all()
        for holiday in holidays:
            session.add(
                Holiday(
                    madrasa_id=madrasa_id,
                    name=holiday.name,
                    category=holiday.category,
                    start_date=holiday.start_date + shift if shift else holiday.start_date,
                    end_date=holiday.end_date + shift if shift else holiday.end_date,
                    class_ids=holiday.class_ids,
                )
            )

    await session.commit()
    await session.refresh(new_session)
    return new_session
