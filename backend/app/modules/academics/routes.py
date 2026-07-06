from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, get_current_madrasa, require_permission
from app.db.session import get_session
from app.modules.auth.models import User
from app.modules.academics.models import (
    AcademicClass,
    AcademicSession,
    Course,
    Enrollment,
    Madrasa,
    Program,
    Section,
    TeacherAssignment,
)
from app.modules.people.models import StudentProfile, TeacherProfile
from app.modules.academics.schemas import (
    AcademicClassCreate,
    AcademicClassRead,
    AcademicSessionCreate,
    AcademicSessionRead,
    CourseCreate,
    CourseRead,
    ProgramCreate,
    ProgramRead,
    SectionCreate,
    SectionRead,
    StudentEnrollRequest,
    TeacherAssignmentCreate,
    TeacherAssignmentRead,
)

router = APIRouter()


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
    current_user: User = Depends(get_current_user),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session)
) -> list[ProgramRead]:
    stmt = select(Program).where(Program.madrasa_id == madrasa.id)
    result = await session.execute(stmt)
    return [ProgramRead.model_validate(p) for p in result.scalars().all()]


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
    current_user: User = Depends(get_current_user),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session)
) -> list[AcademicClassRead]:
    stmt = select(AcademicClass).where(AcademicClass.madrasa_id == madrasa.id)
    result = await session.execute(stmt)
    return [AcademicClassRead.model_validate(c) for c in result.scalars().all()]


# ------------------------------------------------------------------ Sections

@router.post("/classes/{class_id}/sections", response_model=SectionRead)
async def create_section(
    class_id: UUID,
    payload: SectionCreate,
    current_user: User = Depends(require_permission("academics.manage")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> SectionRead:
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
    stmt = select(Section).where(Section.class_id == class_id, Section.madrasa_id == madrasa.id)
    result = await session.execute(stmt)
    return [SectionRead.model_validate(s) for s in result.scalars().all()]


# ------------------------------------------------------------------- Courses

@router.post("/classes/{class_id}/courses", response_model=CourseRead)
async def create_course(
    class_id: UUID,
    payload: CourseCreate,
    current_user: User = Depends(require_permission("academics.manage")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> CourseRead:
    course = Course(madrasa_id=madrasa.id, class_id=class_id, name=payload.name)
    session.add(course)
    await session.commit()
    await session.refresh(course)
    return CourseRead.model_validate(course)


@router.get("/classes/{class_id}/courses", response_model=list[CourseRead])
async def list_courses(
    class_id: UUID,
    current_user: User = Depends(get_current_user),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> list[CourseRead]:
    stmt = select(Course).where(Course.class_id == class_id, Course.madrasa_id == madrasa.id)
    result = await session.execute(stmt)
    return [CourseRead.model_validate(c) for c in result.scalars().all()]


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
    current_user: User = Depends(get_current_user),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> list[AcademicSessionRead]:
    result = await session.execute(select(AcademicSession).where(AcademicSession.madrasa_id == madrasa.id))
    return [AcademicSessionRead.model_validate(row) for row in result.scalars().all()]


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
    assignment = TeacherAssignment(madrasa_id=madrasa.id, **payload.model_dump())
    session.add(assignment)
    await session.commit()
    await session.refresh(assignment)
    return TeacherAssignmentRead.model_validate(assignment)


@router.get("/teacher-assignments", response_model=list[TeacherAssignmentRead])
async def list_teacher_assignments(
    current_user: User = Depends(get_current_user),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
    teacher_id: UUID | None = None,
    class_id: UUID | None = None,
    course_id: UUID | None = None,
    session_id: UUID | None = None,
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
    result = await session.execute(stmt)
    return [TeacherAssignmentRead.model_validate(row) for row in result.scalars().all()]


# ------------------------------------------------------------------ Enrollment

@router.post("/students/enroll")
async def enroll_student(
    payload: StudentEnrollRequest,
    current_user: User = Depends(require_permission("academics.manage")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session)
) -> dict[str, str]:
    stmt = select(StudentProfile).where(StudentProfile.id == payload.student_id, StudentProfile.madrasa_id == madrasa.id)
    result = await session.execute(stmt)
    student = result.scalar_one_or_none()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    enrollment = Enrollment(
        madrasa_id=madrasa.id,
        student_id=payload.student_id,
        session_id=payload.session_id,
        program_id=payload.program_id,
        class_id=payload.class_id,
        section_id=payload.section_id
    )
    session.add(enrollment)
    await session.commit()
    return {"status": "success", "enrollment_id": str(enrollment.id)}
