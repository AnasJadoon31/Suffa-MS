import uuid
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException
from .models import AcademicSession, Enrollment, TeacherAssignment
from .schemas import SessionRolloverRequest

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
    
    # Fetch all enrollments in the current session
    enrollments_stmt = select(Enrollment).where(Enrollment.session_id == current_session_id)
    enrollments_result = await session.execute(enrollments_stmt)
    old_enrollments = enrollments_result.scalars().all()
    
    for old_enrollment in old_enrollments:
        if old_enrollment.class_id in mapping_dict:
            next_class_id = mapping_dict[old_enrollment.class_id]
            if next_class_id is not None:
                new_enrollment = Enrollment(
                    madrasa_id=madrasa_id,
                    student_id=old_enrollment.student_id,
                    session_id=new_session.id,
                    program_id=old_enrollment.program_id,
                    class_id=next_class_id,
                    section_id=old_enrollment.section_id # assuming same section structure
                )
                session.add(new_enrollment)
                
    if payload.copy_teacher_assignments:
        assignments_stmt = select(TeacherAssignment).where(TeacherAssignment.session_id == current_session_id)
        assignments_result = await session.execute(assignments_stmt)
        old_assignments = assignments_result.scalars().all()
        
        for old_assignment in old_assignments:
            new_assignment = TeacherAssignment(
                madrasa_id=madrasa_id,
                teacher_id=old_assignment.teacher_id,
                session_id=new_session.id,
                class_id=old_assignment.class_id,
                course_id=old_assignment.course_id
            )
            session.add(new_assignment)
            
    await session.commit()
    await session.refresh(new_session)
    return new_session
