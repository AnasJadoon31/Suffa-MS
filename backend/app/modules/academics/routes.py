from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, get_current_madrasa
from app.db.session import get_session
from app.modules.auth.models import User
from app.modules.academics.models import Madrasa, Program, AcademicClass, Section, Enrollment
from app.modules.people.models import StudentProfile
from app.modules.academics.schemas import (
    AcademicSessionCreate,
    AcademicSessionRead,
    ProgramCreate,
    ProgramRead,
    AcademicClassRead,
    SectionRead,
    StudentProfileRead,
    StudentEnrollRequest
)

router = APIRouter()

@router.get("/programs", response_model=list[ProgramRead])
async def list_programs(
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session)
) -> list[ProgramRead]:
    stmt = select(Program).where(Program.madrasa_id == madrasa.id)
    result = await session.execute(stmt)
    return [ProgramRead.model_validate(p) for p in result.scalars().all()]


@router.get("/classes", response_model=list[AcademicClassRead])
async def list_classes(
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session)
) -> list[AcademicClassRead]:
    stmt = select(AcademicClass).where(AcademicClass.madrasa_id == madrasa.id)
    result = await session.execute(stmt)
    return [AcademicClassRead.model_validate(c) for c in result.scalars().all()]


@router.get("/classes/{class_id}/sections", response_model=list[SectionRead])
async def list_sections(
    class_id: str,
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session)
) -> list[SectionRead]:
    stmt = select(Section).where(Section.class_id == class_id, Section.madrasa_id == madrasa.id)
    result = await session.execute(stmt)
    return [SectionRead.model_validate(s) for s in result.scalars().all()]


@router.post("/students/enroll")
async def enroll_student(
    payload: StudentEnrollRequest,
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session)
) -> dict[str, str]:
    # Check if student exists
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
