from datetime import UTC, datetime
from datetime import date as DateType
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import (
    ensure_writable_session,
    get_current_user,
    get_current_madrasa,
    require_permission,
)
from app.core.hijri import to_hijri_string
from app.core.pagination import DEFAULT_LIMIT, MAX_LIMIT, paginate_scalars
from app.db.session import get_session
from app.modules.auth.models import User, UserRole
from app.modules.auth.service import UsernameTakenError, generate_unique_username, provision_login
from app.modules.academics.models import (
    AcademicClass,
    AcademicSession,
    Course,
    ClassCourse,
    Enrollment,
    Madrasa,
    Program,
    Section,
    TeacherAssignment,
)
from app.modules.operations.models import TimetableSlot
from app.modules.people.models import Guardian, StudentGuardian, StudentProfile, TeacherProfile
from app.modules.academics.schemas import (
    AcademicClassCreate,
    AcademicClassRead,
    AcademicClassUpdate,
    AcademicSessionCreate,
    AcademicSessionRead,
    AcademicSessionUpdate,
    ClassCourseAssignRequest,
    CourseCreate,
    CourseRead,
    CourseUpdate,
    ProgramCreate,
    ProgramRead,
    ProgramUpdate,
    SectionCreate,
    SectionRead,
    SectionUpdate,
    SessionRolloverRequest,
    StudentEnrollRequest,
    TeacherAssignmentCreate,
    TeacherAssignmentRead,
)

router = APIRouter()


@router.get("/today")
async def today(
    current_user: User = Depends(get_current_user),
    date: DateType | None = None,
) -> dict[str, str]:
    # `date` lets callers convert any Gregorian date (not just "today") to its
    # Hijri equivalent — §E dual-date surfacing (Holidays/Attendance/Salary),
    # reusing the same to_hijri_string() the topbar chip already uses.
    target_date = date or datetime.now(UTC).date()
    return {"gregorian": target_date.isoformat(), "hijri": to_hijri_string(target_date)}


# ------------------------------------------------------------------ Programs

@router.post("/programs", response_model=ProgramRead)
async def create_program(
    payload: ProgramCreate,
    current_user: User = Depends(require_permission("academics.manage")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> ProgramRead:
    program = Program(madrasa_id=madrasa.id, name=payload.name)
    session.add(program)
    await session.commit()
    await session.refresh(program)
    return ProgramRead.model_validate(program)


@router.get("/programs", response_model=list[ProgramRead])
async def list_programs(
    response: Response,
    current_user: User = Depends(get_current_user),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
    limit: int = Query(default=DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
) -> list[ProgramRead]:
    stmt = select(Program).where(Program.madrasa_id == madrasa.id)
    rows = await paginate_scalars(session, stmt.order_by(Program.name), limit=limit, offset=offset, response=response)
    return [ProgramRead.model_validate(p) for p in rows]


@router.put("/programs/{program_id}", response_model=ProgramRead)
async def update_program(
    program_id: UUID,
    payload: ProgramUpdate,
    current_user: User = Depends(require_permission("academics.manage")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> ProgramRead:
    program = await session.get(Program, program_id)
    if not program or program.madrasa_id != madrasa.id:
        raise HTTPException(status_code=404, detail="Program not found")
    
    if payload.name is not None:
        program.name = payload.name
        
    await session.commit()
    await session.refresh(program)
    return ProgramRead.model_validate(program)


@router.delete("/programs/{program_id}")
async def delete_program(
    program_id: UUID,
    current_user: User = Depends(require_permission("academics.manage")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> dict[str, str]:
    program = await session.get(Program, program_id)
    if not program or program.madrasa_id != madrasa.id:
        raise HTTPException(status_code=404, detail="Program not found")

    # Check dependencies
    class_exists = await session.scalar(select(AcademicClass.id).where(AcademicClass.program_id == program_id).limit(1))
    if class_exists:
        raise HTTPException(status_code=409, detail="Cannot delete Program because it has classes assigned to it.")

    enroll_exists = await session.scalar(select(Enrollment.id).where(Enrollment.program_id == program_id).limit(1))
    if enroll_exists:
        raise HTTPException(status_code=409, detail="Cannot delete Program because students are enrolled in it.")

    await session.delete(program)
    await session.commit()
    return {"status": "success"}


# ------------------------------------------------------------------- Classes

@router.post("/classes", response_model=AcademicClassRead)
async def create_class(
    payload: AcademicClassCreate,
    current_user: User = Depends(require_permission("academics.manage")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> AcademicClassRead:
    academic_class = AcademicClass(madrasa_id=madrasa.id, **payload.model_dump())
    session.add(academic_class)
    await session.commit()
    await session.refresh(academic_class)
    return AcademicClassRead.model_validate(academic_class)


@router.get("/classes", response_model=list[AcademicClassRead])
async def list_classes(
    response: Response,
    current_user: User = Depends(get_current_user),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
    limit: int = Query(default=DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
) -> list[AcademicClassRead]:
    stmt = select(AcademicClass).where(AcademicClass.madrasa_id == madrasa.id)
    rows = await paginate_scalars(
        session, stmt.order_by(AcademicClass.name), limit=limit, offset=offset, response=response
    )
    return [AcademicClassRead.model_validate(c) for c in rows]


@router.put("/classes/{class_id}", response_model=AcademicClassRead)
async def update_class(
    class_id: UUID,
    payload: AcademicClassUpdate,
    current_user: User = Depends(require_permission("academics.manage")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> AcademicClassRead:
    academic_class = await session.get(AcademicClass, class_id)
    if not academic_class or academic_class.madrasa_id != madrasa.id:
        raise HTTPException(status_code=404, detail="Class not found")
    
    if payload.name is not None:
        academic_class.name = payload.name
    if payload.program_id is not None:
        academic_class.program_id = payload.program_id
    if payload.default_portal_enabled is not None:
        academic_class.default_portal_enabled = payload.default_portal_enabled
        
    await session.commit()
    await session.refresh(academic_class)
    return AcademicClassRead.model_validate(academic_class)


@router.delete("/classes/{class_id}")
async def delete_class(
    class_id: UUID,
    current_user: User = Depends(require_permission("academics.manage")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> dict[str, str]:
    academic_class = await session.get(AcademicClass, class_id)
    if not academic_class or academic_class.madrasa_id != madrasa.id:
        raise HTTPException(status_code=404, detail="Class not found")

    # Check dependencies
    section_exists = await session.scalar(select(Section.id).where(Section.class_id == class_id).limit(1))
    if section_exists:
        raise HTTPException(status_code=409, detail="Cannot delete Class because it has sections assigned to it.")

    class_course_exists = await session.scalar(select(ClassCourse.id).where(ClassCourse.class_id == class_id).limit(1))
    if class_course_exists:
        raise HTTPException(status_code=409, detail="Cannot delete Class because it has courses assigned to it.")

    teacher_assign_exists = await session.scalar(select(TeacherAssignment.id).where(TeacherAssignment.class_id == class_id).limit(1))
    if teacher_assign_exists:
        raise HTTPException(status_code=409, detail="Cannot delete Class because it has teacher assignments.")

    enroll_exists = await session.scalar(select(Enrollment.id).where(Enrollment.class_id == class_id).limit(1))
    if enroll_exists:
        raise HTTPException(status_code=409, detail="Cannot delete Class because students are enrolled in it.")

    await session.delete(academic_class)
    await session.commit()
    return {"status": "success"}


# ------------------------------------------------------------------ Sections

@router.post("/classes/{class_id}/sections", response_model=SectionRead)
async def create_section(
    class_id: UUID,
    payload: SectionCreate,
    current_user: User = Depends(require_permission("academics.manage")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> SectionRead:
    academic_class = await session.get(AcademicClass, class_id)
    if not academic_class or academic_class.madrasa_id != madrasa.id:
        raise HTTPException(status_code=404, detail="Class not found")
    section = Section(madrasa_id=madrasa.id, class_id=class_id, name=payload.name)
    session.add(section)
    await session.commit()
    await session.refresh(section)
    return SectionRead.model_validate(section)


@router.get("/classes/{class_id}/sections", response_model=list[SectionRead])
async def list_sections(
    class_id: UUID,
    current_user: User = Depends(get_current_user),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session)
) -> list[SectionRead]:
    # Ensure class belongs to this madrasa
    academic_class = await session.get(AcademicClass, class_id)
    if not academic_class or academic_class.madrasa_id != madrasa.id:
        raise HTTPException(status_code=404, detail="Class not found")
        
    stmt = select(Section).where(Section.class_id == class_id)
    result = await session.execute(stmt)
    return [SectionRead.model_validate(s) for s in result.scalars().all()]


@router.put("/classes/{class_id}/sections/{section_id}", response_model=SectionRead)
async def update_section(
    class_id: UUID,
    section_id: UUID,
    payload: SectionUpdate,
    current_user: User = Depends(require_permission("academics.manage")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> SectionRead:
    section = await session.get(Section, section_id)
    if not section or section.class_id != class_id:
        raise HTTPException(status_code=404, detail="Section not found")
        
    # verify class belongs to madrasa
    academic_class = await session.get(AcademicClass, class_id)
    if not academic_class or academic_class.madrasa_id != madrasa.id:
        raise HTTPException(status_code=404, detail="Class not found")
    
    if payload.name is not None:
        section.name = payload.name
        
    await session.commit()
    await session.refresh(section)
    return SectionRead.model_validate(section)


@router.delete("/classes/{class_id}/sections/{section_id}")
async def delete_section(
    class_id: UUID,
    section_id: UUID,
    current_user: User = Depends(require_permission("academics.manage")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> dict[str, str]:
    section = await session.get(Section, section_id)
    if not section or section.class_id != class_id:
        raise HTTPException(status_code=404, detail="Section not found")
        
    academic_class = await session.get(AcademicClass, class_id)
    if not academic_class or academic_class.madrasa_id != madrasa.id:
        raise HTTPException(status_code=404, detail="Class not found")

    # Check dependencies
    enroll_exists = await session.scalar(select(Enrollment.id).where(Enrollment.section_id == section_id).limit(1))
    if enroll_exists:
        raise HTTPException(status_code=409, detail="Cannot delete Section because students are enrolled in it.")

    timetable_exists = await session.scalar(select(TimetableSlot.id).where(TimetableSlot.section_id == section_id).limit(1))
    if timetable_exists:
        raise HTTPException(status_code=409, detail="Cannot delete Section because it has timetable slots scheduled.")

    await session.delete(section)
    await session.commit()
    return {"status": "success"}


# ------------------------------------------------------------------- Courses

@router.post("/courses", response_model=CourseRead)
async def create_course(
    payload: CourseCreate,
    current_user: User = Depends(require_permission("academics.manage")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> CourseRead:
    course = Course(madrasa_id=madrasa.id, name=payload.name)
    session.add(course)
    await session.commit()
    await session.refresh(course)
    return CourseRead.model_validate(course)


@router.get("/courses", response_model=list[CourseRead])
async def list_all_courses(
    response: Response,
    current_user: User = Depends(get_current_user),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
    limit: int = Query(default=DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
) -> list[CourseRead]:
    stmt = select(Course).where(Course.madrasa_id == madrasa.id)
    rows = await paginate_scalars(session, stmt.order_by(Course.name), limit=limit, offset=offset, response=response)
    return [CourseRead.model_validate(c) for c in rows]


@router.put("/courses/{course_id}", response_model=CourseRead)
async def update_course(
    course_id: UUID,
    payload: CourseUpdate,
    current_user: User = Depends(require_permission("academics.manage")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> CourseRead:
    course = await session.get(Course, course_id)
    if not course or course.madrasa_id != madrasa.id:
        raise HTTPException(status_code=404, detail="Course not found")
    
    if payload.name is not None:
        course.name = payload.name
        
    await session.commit()
    await session.refresh(course)
    return CourseRead.model_validate(course)


@router.delete("/courses/{course_id}")
async def delete_course(
    course_id: UUID,
    current_user: User = Depends(require_permission("academics.manage")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> dict[str, str]:
    course = await session.get(Course, course_id)
    if not course or course.madrasa_id != madrasa.id:
        raise HTTPException(status_code=404, detail="Course not found")

    # Check dependencies
    class_course_exists = await session.scalar(select(ClassCourse.id).where(ClassCourse.course_id == course_id).limit(1))
    if class_course_exists:
        raise HTTPException(status_code=409, detail="Cannot delete Course because it is assigned to one or more classes.")

    teacher_assign_exists = await session.scalar(select(TeacherAssignment.id).where(TeacherAssignment.course_id == course_id).limit(1))
    if teacher_assign_exists:
        raise HTTPException(status_code=409, detail="Cannot delete Course because it is assigned to a teacher.")

    await session.delete(course)
    await session.commit()
    return {"status": "success"}


# ------------------------------------------------------------------- Course Assignments

@router.post("/classes/{class_id}/courses/assign", response_model=dict[str, str])
async def assign_course_to_class(
    class_id: UUID,
    payload: ClassCourseAssignRequest,
    current_user: User = Depends(require_permission("academics.manage")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> dict[str, str]:
    # Ensure course exists and belongs to madrasa
    course = await session.get(Course, payload.course_id)
    if not course or course.madrasa_id != madrasa.id:
        raise HTTPException(status_code=404, detail="Course not found")

    academic_class = await session.get(AcademicClass, class_id)
    if not academic_class or academic_class.madrasa_id != madrasa.id:
        raise HTTPException(status_code=404, detail="Class not found")

    assignment = ClassCourse(madrasa_id=madrasa.id, class_id=class_id, course_id=payload.course_id)
    session.add(assignment)
    try:
        await session.commit()
    except Exception:
        await session.rollback()
        raise HTTPException(status_code=400, detail="Course already assigned to this class")
    return {"status": "success"}


@router.get("/classes/{class_id}/courses", response_model=list[CourseRead])
async def list_assigned_courses(
    class_id: UUID,
    current_user: User = Depends(get_current_user),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> list[CourseRead]:
    stmt = (
        select(Course)
        .join(ClassCourse, Course.id == ClassCourse.course_id)
        .where(ClassCourse.class_id == class_id, ClassCourse.madrasa_id == madrasa.id)
    )
    result = await session.execute(stmt)
    return [CourseRead.model_validate(c) for c in result.scalars().all()]


@router.delete("/classes/{class_id}/courses/{course_id}")
async def unassign_class_course(
    class_id: UUID,
    course_id: UUID,
    current_user: User = Depends(require_permission("academics.manage")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> dict[str, str]:
    academic_class = await session.get(AcademicClass, class_id)
    if not academic_class or academic_class.madrasa_id != madrasa.id:
        raise HTTPException(status_code=404, detail="Class not found")

    stmt = select(ClassCourse).where(ClassCourse.class_id == class_id, ClassCourse.course_id == course_id)
    result = await session.execute(stmt)
    class_course = result.scalars().first()
    if not class_course:
        raise HTTPException(status_code=404, detail="Course is not assigned to this class")

    # Check dependencies for this specific class and course
    teacher_assign_exists = await session.scalar(
        select(TeacherAssignment.id)
        .where(TeacherAssignment.class_id == class_id, TeacherAssignment.course_id == course_id)
        .limit(1)
    )
    if teacher_assign_exists:
        raise HTTPException(status_code=409, detail="Cannot unassign Course because it has a teacher assigned for this class.")

    timetable_exists = await session.scalar(
        select(TimetableSlot.id)
        .where(TimetableSlot.class_id == class_id, TimetableSlot.course_id == course_id)
        .limit(1)
    )
    if timetable_exists:
        raise HTTPException(status_code=409, detail="Cannot unassign Course because it is scheduled in the timetable for this class.")

    await session.delete(class_course)
    await session.commit()
    return {"status": "success"}


# ------------------------------------------------------------------ Sessions

@router.post("/sessions", response_model=AcademicSessionRead)
async def create_session_record(
    payload: AcademicSessionCreate,
    current_user: User = Depends(require_permission("academics.manage")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> AcademicSessionRead:
    if payload.is_active:
        await _deactivate_all_sessions(session, madrasa.id)
    record = AcademicSession(madrasa_id=madrasa.id, **payload.model_dump())
    session.add(record)
    await session.commit()
    await session.refresh(record)
    return AcademicSessionRead.model_validate(record)


@router.get("/sessions", response_model=list[AcademicSessionRead])
async def list_sessions(
    response: Response,
    current_user: User = Depends(get_current_user),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
    limit: int = Query(default=DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
) -> list[AcademicSessionRead]:
    stmt = select(AcademicSession).where(AcademicSession.madrasa_id == madrasa.id)
    rows = await paginate_scalars(session, stmt.order_by(AcademicSession.name), limit=limit, offset=offset, response=response)
    return [AcademicSessionRead.model_validate(row) for row in rows]


@router.put("/sessions/{session_id}", response_model=AcademicSessionRead)
async def update_session(
    session_id: UUID,
    payload: AcademicSessionUpdate,
    current_user: User = Depends(require_permission("academics.manage")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> AcademicSessionRead:
    academic_session = await session.get(AcademicSession, session_id)
    if not academic_session or academic_session.madrasa_id != madrasa.id:
        raise HTTPException(status_code=404, detail="Session not found")
        
    if payload.is_active and not academic_session.is_active:
        await _deactivate_all_sessions(session, madrasa.id)

    if payload.name is not None:
        academic_session.name = payload.name
    if payload.gregorian_start is not None:
        academic_session.gregorian_start = payload.gregorian_start
    if payload.gregorian_end is not None:
        academic_session.gregorian_end = payload.gregorian_end
    if payload.hijri_span is not None:
        academic_session.hijri_span = payload.hijri_span
    if payload.is_active is not None:
        academic_session.is_active = payload.is_active
        
    await session.commit()
    await session.refresh(academic_session)
    return AcademicSessionRead.model_validate(academic_session)


@router.delete("/sessions/{session_id}")
async def delete_session(
    session_id: UUID,
    current_user: User = Depends(require_permission("academics.manage")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> dict[str, str]:
    academic_session = await session.get(AcademicSession, session_id)
    if not academic_session or academic_session.madrasa_id != madrasa.id:
        raise HTTPException(status_code=404, detail="Session not found")

    # Check dependencies
    enroll_exists = await session.scalar(select(Enrollment.id).where(Enrollment.session_id == session_id).limit(1))
    if enroll_exists:
        raise HTTPException(status_code=409, detail="Cannot delete Session because students are enrolled in it.")

    teacher_assign_exists = await session.scalar(select(TeacherAssignment.id).where(TeacherAssignment.session_id == session_id).limit(1))
    if teacher_assign_exists:
        raise HTTPException(status_code=409, detail="Cannot delete Session because it has teacher assignments.")

    if academic_session.is_active:
        raise HTTPException(status_code=409, detail="Cannot delete an active session. Please activate another session first.")

    await session.delete(academic_session)
    await session.commit()
    return {"status": "success"}


@router.post("/sessions/{session_id}/activate", response_model=AcademicSessionRead)
async def activate_session(
    session_id: UUID,
    current_user: User = Depends(require_permission("academics.manage")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> AcademicSessionRead:
    record = await session.get(AcademicSession, session_id)
    if record is None or record.madrasa_id != madrasa.id:
        raise HTTPException(status_code=404, detail="Session not found")
    await _deactivate_all_sessions(session, madrasa.id)
    record.is_active = True
    await session.commit()
    await session.refresh(record)
    return AcademicSessionRead.model_validate(record)


from .rollover_service import perform_rollover

@router.post("/sessions/{session_id}/rollover", response_model=AcademicSessionRead)
async def rollover_session(
    session_id: UUID,
    payload: SessionRolloverRequest,
    current_user: User = Depends(require_permission("academics.manage")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> AcademicSessionRead:
    new_session = await perform_rollover(session, madrasa.id, session_id, payload)
    return AcademicSessionRead.model_validate(new_session)


async def _deactivate_all_sessions(session: AsyncSession, madrasa_id: UUID) -> None:
    # Enforces "exactly one active session" (FR-ACAD-02) at the application
    # layer, since Postgres has no native partial-unique-on-boolean shortcut
    # this schema is set up to use.
    result = await session.execute(
        select(AcademicSession).where(AcademicSession.madrasa_id == madrasa_id, AcademicSession.is_active.is_(True))
    )
    for record in result.scalars().all():
        record.is_active = False


# ------------------------------------------------------------ Teacher assignment

@router.post("/teacher-assignments", response_model=TeacherAssignmentRead)
async def create_teacher_assignment(
    payload: TeacherAssignmentCreate,
    current_user: User = Depends(require_permission("assignments.assign_teacher")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> TeacherAssignmentRead:
    teacher = await session.get(TeacherProfile, payload.teacher_id)
    if teacher is None or teacher.madrasa_id != madrasa.id:
        raise HTTPException(status_code=404, detail="Teacher not found")
    await ensure_writable_session(session, madrasa.id, payload.session_id)
    assignment = TeacherAssignment(madrasa_id=madrasa.id, **payload.model_dump())
    session.add(assignment)
    await session.commit()
    await session.refresh(assignment)
    return TeacherAssignmentRead.model_validate(assignment)


@router.get("/teacher-assignments", response_model=list[TeacherAssignmentRead])
async def list_teacher_assignments(
    response: Response,
    current_user: User = Depends(get_current_user),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
    teacher_id: UUID | None = None,
    class_id: UUID | None = None,
    course_id: UUID | None = None,
    session_id: UUID | None = None,
    limit: int = Query(default=DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
) -> list[TeacherAssignmentRead]:
    stmt = select(TeacherAssignment).where(TeacherAssignment.madrasa_id == madrasa.id)
    if teacher_id:
        stmt = stmt.where(TeacherAssignment.teacher_id == teacher_id)
    if class_id:
        stmt = stmt.where(TeacherAssignment.class_id == class_id)
    if course_id:
        stmt = stmt.where(TeacherAssignment.course_id == course_id)
    if session_id:
        stmt = stmt.where(TeacherAssignment.session_id == session_id)
    rows = await paginate_scalars(
        session, stmt.order_by(TeacherAssignment.created_at), limit=limit, offset=offset, response=response
    )
    return [TeacherAssignmentRead.model_validate(row) for row in rows]


# ------------------------------------------------------------------ Enrollment

@router.post("/students/enroll")
async def enroll_student(
    payload: StudentEnrollRequest,
    current_user: User = Depends(require_permission("academics.manage")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session)
) -> dict:
    stmt = select(StudentProfile).where(StudentProfile.id == payload.student_id, StudentProfile.madrasa_id == madrasa.id)
    result = await session.execute(stmt)
    student = result.scalar_one_or_none()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    program = await session.get(Program, payload.program_id)
    if not program or program.madrasa_id != madrasa.id:
        raise HTTPException(status_code=404, detail="Program not found")
    academic_class = await session.get(AcademicClass, payload.class_id)
    if not academic_class or academic_class.madrasa_id != madrasa.id:
        raise HTTPException(status_code=404, detail="Class not found")
    section = await session.get(Section, payload.section_id)
    if not section or section.madrasa_id != madrasa.id or section.class_id != payload.class_id:
        raise HTTPException(status_code=404, detail="Section not found")

    await ensure_writable_session(session, madrasa.id, payload.session_id)

    # One enrollment per (student, session) — re-enrolling moves the student
    # to the new program/class/section instead of stacking duplicate rows.
    enrollment = (
        await session.execute(
            select(Enrollment).where(
                Enrollment.student_id == payload.student_id,
                Enrollment.session_id == payload.session_id,
            )
        )
    ).scalars().first()
    if enrollment is None:
        enrollment = Enrollment(
            madrasa_id=madrasa.id,
            student_id=payload.student_id,
            session_id=payload.session_id,
            program_id=payload.program_id,
            class_id=payload.class_id,
            section_id=payload.section_id
        )
        session.add(enrollment)
    else:
        enrollment.program_id = payload.program_id
        enrollment.class_id = payload.class_id
        enrollment.section_id = payload.section_id

    # B7-k: a class with portal access switched off means its students don't
    # get their own portal login — instead their guardians do. We never
    # silently re-enable a student's portal on a later move (that could have
    # been an explicit admin choice for other reasons); we only ever act when
    # the target class says "no student portal".
    guardian_logins: list[dict[str, str]] = []
    if not academic_class.default_portal_enabled:
        student_user = await session.get(User, student.user_id)
        if student_user is not None:
            student_user.portal_enabled = False
        student.portal_enabled = False

        guardians = (
            await session.execute(
                select(Guardian)
                .join(StudentGuardian, StudentGuardian.guardian_id == Guardian.id)
                .where(StudentGuardian.student_id == student.id, Guardian.madrasa_id == madrasa.id)
            )
        ).scalars().all()
        for guardian in guardians:
            if guardian.user_id is not None:
                continue
            username = await generate_unique_username(session, guardian.name or "guardian")
            try:
                guardian_user, set_password_url = await provision_login(
                    session,
                    madrasa_id=madrasa.id,
                    actor_id=current_user.id,
                    username=username,
                    role=UserRole.parent,
                    preferred_language=guardian.preferred_language,
                )
            except UsernameTakenError:
                continue  # extremely unlikely race on the generated slug; skip rather than fail enrolment
            guardian.user_id = guardian_user.id
            guardian_logins.append({"guardian_id": str(guardian.id), "username": guardian_user.username, "set_password_url": set_password_url})

    await session.commit()
    return {"status": "success", "enrollment_id": str(enrollment.id), "guardian_logins_provisioned": guardian_logins}
