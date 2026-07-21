from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_madrasa, get_current_user, require_permission
from app.core.pagination import DEFAULT_LIMIT, MAX_LIMIT, paginate_scalars
from app.db.session import get_session
from app.modules.academics.models import Madrasa
from app.modules.auth.models import User, UserRole
from app.modules.auth.service import UsernameTakenError, provision_login, reissue_set_password_link
from app.modules.people.models import Guardian, StudentGuardian, StudentProfile, TeacherProfile
from app.modules.people.schemas import (
    GuardianCreate,
    GuardianCredentialsRequest,
    GuardianRead,
    StudentCreate,
    StudentProvisionedRead,
    StudentRead,
    StudentUpdate,
    TeacherCreate,
    TeacherProvisionedRead,
    TeacherRead,
    TeacherUpdate,
)

router = APIRouter()


async def _next_code(session: AsyncSession, madrasa_id: UUID, model, prefix: str) -> str:
    # Sequential per-tenant default (count + 1). A concurrent double-submit
    # could in theory race for the same number; the unique DB constraint on
    # the code column still guarantees no duplicate is ever persisted, it
    # would just surface as a 409 to retry rather than silently colliding.
    count = (
        await session.execute(select(func.count()).select_from(model).where(model.madrasa_id == madrasa_id))
    ).scalar_one()
    return f"{prefix}-{count + 1:04d}"


# ---------------------------------------------------------------- Teachers

@router.post("/teachers", response_model=TeacherProvisionedRead)
async def create_teacher(
    payload: TeacherCreate,
    current_user: User = Depends(require_permission("teachers.add")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> TeacherProvisionedRead:
    try:
        user, set_password_url = await provision_login(
            session,
            madrasa_id=madrasa.id,
            actor_id=current_user.id,
            username=payload.username,
            role=UserRole.teacher,
            preferred_language=payload.preferred_language,
        )
    except UsernameTakenError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc

    if payload.employee_code:
        clash = await session.execute(
            select(TeacherProfile).where(
                TeacherProfile.employee_code == payload.employee_code,
                TeacherProfile.madrasa_id == madrasa.id,
            )
        )
        if clash.scalar_one_or_none() is not None:
            raise HTTPException(status_code=409, detail="Employee code already in use")
        employee_code = payload.employee_code
    else:
        employee_code = await _next_code(session, madrasa.id, TeacherProfile, "TCH")

    profile = TeacherProfile(
        madrasa_id=madrasa.id,
        user_id=user.id,
        employee_code=employee_code,
        name=payload.name,
        whatsapp_number=payload.whatsapp_number,
        qualifications=payload.qualifications,
        join_date=payload.join_date,
        cnic=payload.cnic,
        address=payload.address,
        emergency_contact=payload.emergency_contact,
        photo_file_id=payload.photo_file_id,
        is_principal_delegate=payload.is_principal_delegate or False,
    )
    session.add(profile)
    await session.commit()
    await session.refresh(profile)

    return TeacherProvisionedRead(**TeacherRead.model_validate(profile).model_dump(), set_password_url=set_password_url)


@router.get("/teachers", response_model=list[TeacherRead])
async def list_teachers(
    response: Response,
    current_user: User = Depends(require_permission("teachers.view")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
    search: str | None = Query(default=None, description="Match against name or employee code"),
    status_filter: str | None = Query(default=None, alias="status"),
    limit: int = Query(default=DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
) -> list[TeacherRead]:
    stmt = select(TeacherProfile).where(TeacherProfile.madrasa_id == madrasa.id)
    if search:
        like = f"%{search}%"
        stmt = stmt.where((TeacherProfile.name.ilike(like)) | (TeacherProfile.employee_code.ilike(like)))
    if status_filter:
        stmt = stmt.where(TeacherProfile.status == status_filter)
    rows = await paginate_scalars(
        session, stmt.order_by(TeacherProfile.name), limit=limit, offset=offset, response=response
    )
    return [TeacherRead.model_validate(row) for row in rows]


@router.get("/teachers/{teacher_id}", response_model=TeacherRead)
async def get_teacher(
    teacher_id: UUID,
    current_user: User = Depends(require_permission("teachers.view")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> TeacherRead:
    teacher = await _get_or_404(session, TeacherProfile, teacher_id, madrasa.id)
    return TeacherRead.model_validate(teacher)


@router.put("/teachers/{teacher_id}", response_model=TeacherRead)
async def update_teacher(
    teacher_id: UUID,
    payload: TeacherUpdate,
    current_user: User = Depends(require_permission("teachers.edit")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> TeacherRead:
    teacher = await _get_or_404(session, TeacherProfile, teacher_id, madrasa.id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(teacher, field, value)
    await session.commit()
    await session.refresh(teacher)
    return TeacherRead.model_validate(teacher)


@router.post("/teachers/{teacher_id}/deactivate", response_model=TeacherRead)
async def deactivate_teacher(
    teacher_id: UUID,
    current_user: User = Depends(require_permission("teachers.edit")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> TeacherRead:
    teacher = await _get_or_404(session, TeacherProfile, teacher_id, madrasa.id)
    teacher.status = "inactive"
    await session.commit()
    await session.refresh(teacher)
    return TeacherRead.model_validate(teacher)


@router.post("/teachers/{teacher_id}/credentials-link")
async def reissue_teacher_credentials(
    teacher_id: UUID,
    current_user: User = Depends(require_permission("teachers.edit")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> dict[str, str]:
    teacher = await _get_or_404(session, TeacherProfile, teacher_id, madrasa.id)
    user = await session.get(User, teacher.user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="Linked user account not found")
    url = reissue_set_password_link(session, madrasa_id=madrasa.id, actor_id=current_user.id, user=user)
    await session.commit()
    return {"username": user.username, "set_password_url": url}


@router.get("/teachers/{user_id}/taught-classes", response_model=list[str])
async def list_teacher_taught_classes(
    user_id: UUID,
    response: Response,
    current_user: User = Depends(get_current_user),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
    limit: int = Query(default=DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
) -> list[str]:
    from app.core.teaching_scope import taught_class_ids
    from app.modules.operations.routes import _active_session_id

    # The principal can view any teacher's assigned classes.
    # A teacher can view their own assigned classes.
    if current_user.role != UserRole.principal and current_user.id != user_id:
        from app.core.dependencies import user_has_permission
        if not await user_has_permission(current_user, "teachers.view", session):
            raise HTTPException(status_code=403, detail="Not authorized")

    teacher = (
        await session.execute(select(TeacherProfile).where(TeacherProfile.user_id == user_id))
    ).scalar_one_or_none()

    if teacher is None or teacher.madrasa_id != madrasa.id:
        raise HTTPException(status_code=404, detail="Teacher not found")

    active_session_id = await _active_session_id(session, madrasa.id)
    if active_session_id is None:
        return []

    cids = await taught_class_ids(session, madrasa_id=madrasa.id, teacher_id=teacher.id, session_id=active_session_id)
    return [str(cid) for cid in cids]


# ----------------------------------------------------------------- Students

@router.post("/students", response_model=StudentProvisionedRead)
async def create_student(
    payload: StudentCreate,
    current_user: User = Depends(require_permission("students.add")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> StudentProvisionedRead:
    try:
        user, set_password_url = await provision_login(
            session,
            madrasa_id=madrasa.id,
            actor_id=current_user.id,
            username=payload.username,
            role=UserRole.student,
            preferred_language=payload.preferred_language,
            # Class-level portal defaults apply at enrolment time, once a
            # class is known; before that, default to enabled (FR-STU-03).
            portal_enabled=payload.portal_enabled if payload.portal_enabled is not None else True,
        )
    except UsernameTakenError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc

    if payload.admission_number:
        clash = await session.execute(
            select(StudentProfile).where(
                StudentProfile.admission_number == payload.admission_number,
                StudentProfile.madrasa_id == madrasa.id,
            )
        )
        if clash.scalar_one_or_none() is not None:
            raise HTTPException(status_code=409, detail="Admission number already in use")
        admission_number = payload.admission_number
    else:
        admission_number = await _next_code(session, madrasa.id, StudentProfile, "ADM")

    profile = StudentProfile(
        madrasa_id=madrasa.id,
        user_id=user.id,
        admission_number=admission_number,
        name=payload.name,
        date_of_birth=payload.date_of_birth,
        portal_enabled=payload.portal_enabled if payload.portal_enabled is not None else True,
        b_form_number=payload.b_form_number,
        address=payload.address,
        photo_file_id=payload.photo_file_id,
    )
    session.add(profile)
    await session.flush()

    for guardian_id in payload.guardian_ids:
        guardian = await session.get(Guardian, guardian_id)
        if guardian is None or guardian.madrasa_id != madrasa.id:
            raise HTTPException(status_code=404, detail=f"Guardian {guardian_id} not found")
        session.add(StudentGuardian(student_id=profile.id, guardian_id=guardian_id))

    await session.commit()
    await session.refresh(profile)

    return StudentProvisionedRead(**StudentRead.model_validate(profile).model_dump(), set_password_url=set_password_url)


@router.get("/students", response_model=list[StudentRead])
async def list_students(
    response: Response,
    current_user: User = Depends(require_permission("students.view")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
    search: str | None = Query(default=None, description="Match against name or admission number"),
    status_filter: str | None = Query(default=None, alias="status"),
    limit: int = Query(default=DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
) -> list[StudentRead]:
    stmt = select(StudentProfile).where(StudentProfile.madrasa_id == madrasa.id)
    if search:
        like = f"%{search}%"
        stmt = stmt.where((StudentProfile.name.ilike(like)) | (StudentProfile.admission_number.ilike(like)))
    if status_filter:
        stmt = stmt.where(StudentProfile.status == status_filter)
    rows = await paginate_scalars(
        session, stmt.order_by(StudentProfile.name), limit=limit, offset=offset, response=response
    )
    return [StudentRead.model_validate(row) for row in rows]


@router.get("/students/{student_id}", response_model=StudentRead)
async def get_student(
    student_id: UUID,
    current_user: User = Depends(require_permission("students.view")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> StudentRead:
    student = await _get_or_404(session, StudentProfile, student_id, madrasa.id)
    return StudentRead.model_validate(student)


@router.put("/students/{student_id}", response_model=StudentRead)
async def update_student(
    student_id: UUID,
    payload: StudentUpdate,
    current_user: User = Depends(require_permission("students.edit")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> StudentRead:
    student = await _get_or_404(session, StudentProfile, student_id, madrasa.id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(student, field, value)
    await session.commit()
    await session.refresh(student)
    return StudentRead.model_validate(student)


@router.post("/students/{student_id}/deactivate", response_model=StudentRead)
async def deactivate_student(
    student_id: UUID,
    current_user: User = Depends(require_permission("students.edit")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> StudentRead:
    student = await _get_or_404(session, StudentProfile, student_id, madrasa.id)
    student.status = "inactive"
    await session.commit()
    await session.refresh(student)
    return StudentRead.model_validate(student)


@router.post("/students/{student_id}/credentials-link")
async def reissue_student_credentials(
    student_id: UUID,
    current_user: User = Depends(require_permission("students.send_credentials")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> dict[str, str]:
    student = await _get_or_404(session, StudentProfile, student_id, madrasa.id)
    user = await session.get(User, student.user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="Linked user account not found")
    url = reissue_set_password_link(session, madrasa_id=madrasa.id, actor_id=current_user.id, user=user)
    await session.commit()
    return {"username": user.username, "set_password_url": url}


# ---------------------------------------------------------------- Guardians

@router.post("/guardians", response_model=GuardianRead)
async def create_guardian(
    payload: GuardianCreate,
    current_user: User = Depends(require_permission("students.add")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> GuardianRead:
    guardian = Guardian(
        madrasa_id=madrasa.id,
        name=payload.name,
        relationship=payload.relationship,
        phone_numbers=payload.phone_numbers,
        cnic=payload.cnic,
        address=payload.address,
        preferred_language=payload.preferred_language,
    )
    session.add(guardian)
    await session.flush()

    for student_id in payload.student_ids:
        student = await session.get(StudentProfile, student_id)
        if student is None or student.madrasa_id != madrasa.id:
            raise HTTPException(status_code=404, detail=f"Student {student_id} not found")
        session.add(StudentGuardian(student_id=student_id, guardian_id=guardian.id))

    await session.commit()
    await session.refresh(guardian)
    return GuardianRead.model_validate(guardian)


@router.post("/guardians/{guardian_id}/credentials-link")
async def guardian_credentials_link(
    guardian_id: UUID,
    payload: GuardianCredentialsRequest,
    current_user: User = Depends(require_permission("students.send_credentials")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> dict[str, str]:
    """Provision (or re-issue) a guardian portal login — used when a student's
    class has portal access switched off (B7-k)."""
    guardian = await _get_or_404(session, Guardian, guardian_id, madrasa.id)

    if guardian.user_id is not None:
        user = await session.get(User, guardian.user_id)
        if user is None:
            raise HTTPException(status_code=404, detail="Linked user account not found")
        url = reissue_set_password_link(session, madrasa_id=madrasa.id, actor_id=current_user.id, user=user)
        await session.commit()
        return {"username": user.username, "set_password_url": url}

    if not payload.username:
        raise HTTPException(status_code=400, detail="username is required to provision a new guardian login")
    try:
        user, url = await provision_login(
            session,
            madrasa_id=madrasa.id,
            actor_id=current_user.id,
            username=payload.username,
            role=UserRole.parent,
            preferred_language=guardian.preferred_language,
        )
    except UsernameTakenError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    guardian.user_id = user.id
    await session.commit()
    return {"username": user.username, "set_password_url": url}


@router.get("/guardians", response_model=list[GuardianRead])
async def list_guardians(
    response: Response,
    current_user: User = Depends(require_permission("students.view")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
    search: str | None = Query(default=None, description="Match against guardian name"),
    limit: int = Query(default=DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
) -> list[GuardianRead]:
    stmt = select(Guardian).where(Guardian.madrasa_id == madrasa.id)
    if search:
        stmt = stmt.where(Guardian.name.ilike(f"%{search}%"))
    rows = await paginate_scalars(
        session, stmt.order_by(Guardian.name), limit=limit, offset=offset, response=response
    )
    return [GuardianRead.model_validate(row) for row in rows]


@router.post("/guardians/{guardian_id}/students/{student_id}", response_model=dict)
async def link_student_guardian(
    guardian_id: UUID,
    student_id: UUID,
    current_user: User = Depends(require_permission("students.edit")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> dict:
    guardian = await _get_or_404(session, Guardian, guardian_id, madrasa.id)
    student = await _get_or_404(session, StudentProfile, student_id, madrasa.id)
    
    # Check if already linked
    exists = await session.scalar(
        select(StudentGuardian.id)
        .where(StudentGuardian.student_id == student_id, StudentGuardian.guardian_id == guardian_id)
        .limit(1)
    )
    if not exists:
        link = StudentGuardian(student_id=student_id, guardian_id=guardian_id)
        session.add(link)
        await session.commit()
    return {"status": "success"}

@router.delete("/guardians/{guardian_id}/students/{student_id}", response_model=dict)
async def unlink_student_guardian(
    guardian_id: UUID,
    student_id: UUID,
    current_user: User = Depends(require_permission("students.edit")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> dict:
    guardian = await _get_or_404(session, Guardian, guardian_id, madrasa.id)
    student = await _get_or_404(session, StudentProfile, student_id, madrasa.id)
    
    link = await session.scalar(
        select(StudentGuardian)
        .where(StudentGuardian.student_id == student_id, StudentGuardian.guardian_id == guardian_id)
        .limit(1)
    )
    if link:
        await session.delete(link)
        await session.commit()
    return {"status": "success"}

@router.get("/students/{student_id}/guardians", response_model=list[GuardianRead])
async def list_student_guardians(
    student_id: UUID,
    response: Response,
    current_user: User = Depends(require_permission("students.view")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
    limit: int = Query(default=DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
) -> list[GuardianRead]:
    await _get_or_404(session, StudentProfile, student_id, madrasa.id)
    stmt = (
        select(Guardian)
        .join(StudentGuardian, StudentGuardian.guardian_id == Guardian.id)
        .where(StudentGuardian.student_id == student_id, Guardian.madrasa_id == madrasa.id)
    )
    rows = await paginate_scalars(session, stmt.order_by(Guardian.name), limit=limit, offset=offset, response=response)
    return [GuardianRead.model_validate(row) for row in rows]


@router.get("/guardians/{guardian_id}/students", response_model=list[StudentRead])
async def list_guardian_students(
    guardian_id: UUID,
    current_user: User = Depends(require_permission("students.view")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> list[StudentRead]:
    # Need to verify the guardian belongs to the madrasa
    guardian = await _get_or_404(session, Guardian, guardian_id, madrasa.id)

    stmt = (
        select(StudentProfile)
        .join(StudentGuardian, StudentProfile.id == StudentGuardian.student_id)
        .where(StudentGuardian.guardian_id == guardian_id)
        .where(StudentProfile.madrasa_id == madrasa.id)
    )
    result = await session.execute(stmt)
    rows = result.scalars().all()
    return [StudentRead.model_validate(row) for row in rows]

async def _get_or_404(session: AsyncSession, model, record_id: UUID, madrasa_id: UUID):
    record = await session.get(model, record_id)
    if record is None or record.madrasa_id != madrasa_id:
        raise HTTPException(status_code=404, detail=f"{model.__name__} not found")
    return record
