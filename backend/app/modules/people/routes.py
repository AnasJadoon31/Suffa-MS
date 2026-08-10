from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import func, select, exc, or_ as sqlalchemy_or, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import _user_is_admin, get_current_madrasa, get_current_user, require_permission
from app.core.error_codes import ErrorCode
from app.core.pagination import DEFAULT_LIMIT, MAX_LIMIT, paginate_scalars
from app.db.session import get_session
from app.modules.academics.models import AcademicClass, AcademicSession, Enrollment, Madrasa, Program, Section
from app.modules.auth.models import User, UserRole
from app.modules.auth.service import UsernameTakenError, provision_login, reissue_set_password_link
from app.modules.auth.username_service import generate_unique_username, preview_username
from app.modules.people.models import (
    Guardian,
    StudentAdmissionRecord,
    StudentGuardian,
    StudentProfile,
    TeacherProfile,
)
from app.modules.operations.admissions import (
    admission_answer_date,
    admission_answer_enabled,
    admission_answer_text,
    normalize_admission_fields,
    validate_admission_answers,
)
from app.modules.operations.models import AdmissionForm
from app.modules.people.schemas import (
    GuardianCreate,
    GuardianCredentialsRequest,
    GuardianRead,
    GuardianUpdate,
    StudentCreate,
    StudentAdmissionRecordRead,
    StudentEnrollmentRead,
    StudentProvisionedRead,
    StudentRead,
    StudentUpdate,
    TeacherCreate,
    TeacherProvisionedRead,
    TeacherRead,
    TeacherUpdate,
)

router = APIRouter()


@router.get("/username-proposal")
async def username_proposal(
    name: str = Query(min_length=1, max_length=160),
    current_user: User = Depends(get_current_user),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> dict[str, str]:
    del current_user
    return {
        "username": await generate_unique_username(
            session,
            name=name,
            madrasa_id=madrasa.id,
        )
    }


async def _student_read(session: AsyncSession, student: StudentProfile) -> StudentRead:
    record = (
        await session.execute(
            select(StudentAdmissionRecord).where(
                StudentAdmissionRecord.student_id == student.id,
                StudentAdmissionRecord.madrasa_id == student.madrasa_id,
            )
        )
    ).scalar_one_or_none()
    data = StudentRead.model_validate(student).model_dump()
    enrollment_row = (
        await session.execute(
            select(Enrollment, AcademicSession.name, Program.name, AcademicClass.name, Section.name)
            .join(AcademicSession, AcademicSession.id == Enrollment.session_id)
            .join(Program, Program.id == Enrollment.program_id)
            .join(AcademicClass, AcademicClass.id == Enrollment.class_id)
            .join(Section, Section.id == Enrollment.section_id)
            .where(
                Enrollment.student_id == student.id,
                Enrollment.madrasa_id == student.madrasa_id,
                Enrollment.ended_on.is_(None),
            )
            .order_by(AcademicSession.is_active.desc(), Enrollment.started_on.desc())
        )
    ).first()
    data["admission_record"] = (
        StudentAdmissionRecordRead.model_validate(record) if record is not None else None
    )
    if enrollment_row is not None:
        enrollment, session_name, program_name, class_name, section_name = enrollment_row
        data["active_enrollment"] = StudentEnrollmentRead(
            id=enrollment.id,
            session_id=enrollment.session_id,
            session_name=session_name,
            program_id=enrollment.program_id,
            program_name=program_name,
            class_id=enrollment.class_id,
            class_name=class_name,
            section_id=enrollment.section_id,
            section_name=section_name,
            started_on=enrollment.started_on,
        )
    return StudentRead(**data)


async def _next_code(session: AsyncSession, madrasa_id: UUID, model, prefix: str) -> str:
    # Serialize number allocation per tenant on PostgreSQL. The tenant-unique
    # database constraint remains the final atomic guard.
    if session.get_bind().dialect.name == "postgresql":
        await session.execute(
            text("SELECT pg_advisory_xact_lock(hashtext(:allocation_key))"),
            {"allocation_key": f"{madrasa_id}:{model.__tablename__}:{prefix}"},
        )
    code_column = (
        getattr(model, "admission_number", None)
        or getattr(model, "employee_code", None)
    )
    if code_column is None:
        raise RuntimeError(f"{model.__tablename__} does not expose an allocatable code column")
    existing_codes = (
        await session.execute(
            select(code_column).where(
                model.madrasa_id == madrasa_id,
                code_column.like(f"{prefix}-%"),
            )
        )
    ).scalars().all()
    max_suffix = 0
    for code in existing_codes:
        suffix = str(code).removeprefix(f"{prefix}-")
        if suffix.isdigit():
            max_suffix = max(max_suffix, int(suffix))
    return f"{prefix}-{max_suffix + 1:04d}"


async def _next_guardian_code(session: AsyncSession, madrasa_id: UUID) -> str:
    """Generate the next GR-XXXX username for a guardian login."""
    existing = (
        await session.execute(
            select(User.username).where(
                User.madrasa_id == madrasa_id,
                User.role == UserRole.parent,
                User.username.like("GR-%"),
            )
        )
    ).scalars().all()
    max_suffix = 0
    for code in existing:
        suffix = str(code).removeprefix("GR-")
        if suffix.isdigit():
            max_suffix = max(max_suffix, int(suffix))
    return f"GR-{max_suffix + 1:04d}"


async def _student_guardian_count(session: AsyncSession, student_id: UUID, madrasa_id: UUID) -> int:
    return await session.scalar(
        select(func.count())
        .select_from(StudentGuardian)
        .where(
            StudentGuardian.madrasa_id == madrasa_id,
            StudentGuardian.student_id == student_id,
        )
    ) or 0


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
    if not await _user_is_admin(current_user, session) and current_user.id != user_id:
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
    admission_form = None
    fields_definition = []
    if payload.admission_form_id is not None:
        admission_form = await session.get(AdmissionForm, payload.admission_form_id)
        if admission_form is None or admission_form.madrasa_id != madrasa.id:
            raise HTTPException(status_code=404, detail="Admission form not found")
        fields_definition = normalize_admission_fields(admission_form.fields_definition or [])
        validate_admission_answers(fields_definition, payload.admission_answers, require_guardian=not payload.is_independent)
    else:
        raise HTTPException(status_code=422, detail="An admission form is required to create a student")

    student_name = payload.name or admission_answer_text(payload.admission_answers, "student_name")
    student_dob = payload.date_of_birth or admission_answer_date(payload.admission_answers, "student_date_of_birth")
    if not student_name:
        raise HTTPException(status_code=422, detail="Student name is required")
    if student_dob is None:
        raise HTTPException(status_code=422, detail="Student date of birth is required")
    student_phone = payload.phone or admission_answer_text(payload.admission_answers, "student_phone") or None
    student_portal_enabled = payload.portal_enabled
    if student_portal_enabled is None:
        student_portal_enabled = admission_answer_enabled(payload.admission_answers, "student_portal_enabled", default=True)
    if payload.is_independent and student_portal_enabled and not student_phone:
        raise HTTPException(status_code=422, detail="An independent student with portal access requires a phone")
    if not payload.is_independent and not payload.guardian_ids:
        raise HTTPException(status_code=422, detail="A dependent student requires at least one guardian")

    # Always generate admission_number first — it becomes the username
    admission_number = await _next_code(session, madrasa.id, StudentProfile, "ADM")
    student_username = payload.username or admission_number

    try:
        user, set_password_url = await provision_login(
            session,
            madrasa_id=madrasa.id,
            actor_id=current_user.id,
            username=student_username,
            role=UserRole.student,
            preferred_language=payload.preferred_language,
            portal_enabled=student_portal_enabled,
        )
    except UsernameTakenError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc

    profile = StudentProfile(
        madrasa_id=madrasa.id,
        user_id=user.id,
        admission_number=admission_number,
        name=student_name,
        date_of_birth=student_dob,
        portal_enabled=student_portal_enabled,
        b_form_number=payload.b_form_number or admission_answer_text(payload.admission_answers, "student_b_form_number") or None,
        address=payload.address or admission_answer_text(payload.admission_answers, "student_address") or None,
        phone=student_phone,
        is_independent=payload.is_independent,
        photo_file_id=payload.photo_file_id,
    )
    session.add(profile)
    await session.flush()

    for guardian_id in payload.guardian_ids:
        guardian = await session.get(Guardian, guardian_id)
        if guardian is None or guardian.madrasa_id != madrasa.id:
            raise HTTPException(status_code=404, detail=f"Guardian {guardian_id} not found")
        session.add(
            StudentGuardian(
                madrasa_id=madrasa.id,
                student_id=profile.id,
                guardian_id=guardian_id,
                relationship=guardian.relationship,
            )
        )

    if admission_form is not None:
        session.add(
            StudentAdmissionRecord(
                madrasa_id=madrasa.id,
                student_id=profile.id,
                form_id=admission_form.id,
                application_id=None,
                form_title=admission_form.title,
                fields_definition=fields_definition,
                answers=payload.admission_answers,
                created_by_id=current_user.id,
            )
        )

    await session.commit()
    await session.refresh(profile)

    student_read = await _student_read(session, profile)
    return StudentProvisionedRead(**student_read.model_dump(), set_password_url=set_password_url)


@router.get("/students", response_model=list[StudentRead])
async def list_students(
    response: Response,
    current_user: User = Depends(require_permission("students.view")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
    search: str | None = Query(default=None, description="Match against name or admission number"),
    status_filter: str | None = Query(default=None, alias="status"),
    section_id: UUID | None = Query(default=None),
    limit: int = Query(default=DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
) -> list[StudentRead]:
    stmt = select(StudentProfile).where(StudentProfile.madrasa_id == madrasa.id)
    if search:
        like = f"%{search}%"
        stmt = stmt.where((StudentProfile.name.ilike(like)) | (StudentProfile.admission_number.ilike(like)))
    if status_filter:
        stmt = stmt.where(StudentProfile.status == status_filter)
    if section_id:
        stmt = stmt.where(
            StudentProfile.id.in_(
                select(Enrollment.student_id).where(
                    Enrollment.madrasa_id == madrasa.id,
                    Enrollment.section_id == section_id,
                )
            )
        )
    rows = await paginate_scalars(
        session, stmt.order_by(StudentProfile.name), limit=limit, offset=offset, response=response
    )
    return [await _student_read(session, row) for row in rows]


@router.get("/students/{student_id}", response_model=StudentRead)
async def get_student(
    student_id: UUID,
    current_user: User = Depends(require_permission("students.view")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> StudentRead:
    student = await _get_or_404(session, StudentProfile, student_id, madrasa.id)
    return await _student_read(session, student)


@router.put("/students/{student_id}", response_model=StudentRead)
async def update_student(
    student_id: UUID,
    payload: StudentUpdate,
    current_user: User = Depends(require_permission("students.edit")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> StudentRead:
    student = await _get_or_404(session, StudentProfile, student_id, madrasa.id)
    updates = payload.model_dump(exclude_unset=True)
    admission_answers = updates.pop("admission_answers", None)
    resulting_independent = updates.get("is_independent", student.is_independent)
    resulting_phone = updates.get("phone", student.phone)
    resulting_portal = updates.get("portal_enabled", student.portal_enabled)
    if resulting_independent and resulting_portal and not resulting_phone:
        raise HTTPException(
            status_code=422,
            detail="An independent student with portal access requires a phone",
        )
    if resulting_independent:
        linked_guardian = await session.scalar(
            select(StudentGuardian.id).where(
                StudentGuardian.madrasa_id == madrasa.id,
                StudentGuardian.student_id == student.id,
            )
        )
        if linked_guardian is not None:
            raise HTTPException(
                status_code=422,
                detail="Unlink guardians before marking the student independent",
            )
    elif "is_independent" in updates and await _student_guardian_count(session, student.id, madrasa.id) == 0:
        raise HTTPException(status_code=422, detail="A dependent student requires at least one guardian")
    for field, value in updates.items():
        setattr(student, field, value)
    if admission_answers is not None:
        admission_record = await session.scalar(
            select(StudentAdmissionRecord).where(
                StudentAdmissionRecord.student_id == student.id,
                StudentAdmissionRecord.madrasa_id == madrasa.id,
            )
        )
        if admission_record is None:
            raise HTTPException(status_code=404, detail="Student admission information not found")
        # Merge instead of replace so fields hidden by a later template version
        # remain intact.
        merged_answers = {**(admission_record.answers or {}), **admission_answers}
        validate_admission_answers(
            admission_record.fields_definition or [],
            merged_answers,
            require_guardian=not updates.get("is_independent", student.is_independent),
        )
        admission_record.answers = merged_answers
        if "student_name" in admission_answers:
            student.name = admission_answer_text(merged_answers, "student_name") or student.name
        if "student_date_of_birth" in admission_answers:
            student.date_of_birth = admission_answer_date(merged_answers, "student_date_of_birth") or student.date_of_birth
        if "student_b_form_number" in admission_answers:
            student.b_form_number = admission_answer_text(merged_answers, "student_b_form_number") or None
        if "student_address" in admission_answers:
            student.address = admission_answer_text(merged_answers, "student_address") or None
        if "student_phone" in admission_answers:
            student.phone = admission_answer_text(merged_answers, "student_phone") or None
        if "student_portal_enabled" in admission_answers:
            student.portal_enabled = admission_answer_enabled(merged_answers, "student_portal_enabled", default=student.portal_enabled)
    try:
        await session.commit()
    except exc.IntegrityError as e:
        await session.rollback()
        raise HTTPException(status_code=409, detail=ErrorCode.ADMISSION_NUMBER_EXISTS) from e
    await session.refresh(student)
    return await _student_read(session, student)


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
    return await _student_read(session, student)


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

    guardian_username = await _next_guardian_code(session, madrasa.id)
    try:
        user, _ = await provision_login(
            session,
            madrasa_id=madrasa.id,
            actor_id=current_user.id,
            username=guardian_username,
            role=UserRole.parent,
            preferred_language=payload.preferred_language,
        )
    except UsernameTakenError:
        raise HTTPException(status_code=500, detail="Failed to generate unique guardian username")
    guardian.user_id = user.id

    for student_id in payload.student_ids:
        student = await session.get(StudentProfile, student_id)
        if student is None or student.madrasa_id != madrasa.id:
            raise HTTPException(status_code=404, detail=f"Student {student_id} not found")
        session.add(
            StudentGuardian(
                madrasa_id=madrasa.id,
                student_id=student_id,
                guardian_id=guardian.id,
                relationship=guardian.relationship,
            )
        )

    await session.commit()
    await session.refresh(guardian)
    return GuardianRead.model_validate(guardian)


@router.put("/guardians/{guardian_id}", response_model=GuardianRead)
async def update_guardian(
    guardian_id: UUID,
    payload: GuardianUpdate,
    current_user: User = Depends(require_permission("students.edit")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> GuardianRead:
    guardian = await _get_or_404(session, Guardian, guardian_id, madrasa.id)
    if payload.name is not None: guardian.name = payload.name
    if payload.relationship is not None: guardian.relationship = payload.relationship
    if payload.phone_numbers is not None: guardian.phone_numbers = payload.phone_numbers
    if payload.cnic is not None: guardian.cnic = payload.cnic
    if payload.address is not None: guardian.address = payload.address
    if payload.preferred_language is not None: guardian.preferred_language = payload.preferred_language
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
        raise HTTPException(status_code=400, detail="username is required")
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
    search: str | None = Query(default=None, description="Match against guardian name, phone, or CNIC"),
    limit: int = Query(default=DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
) -> list[GuardianRead]:
    stmt = select(Guardian).where(Guardian.madrasa_id == madrasa.id)
    if search:
        like = f"%{search}%"
        stmt = stmt.where(
            (Guardian.name.ilike(like))
            | (Guardian.phone_numbers.ilike(like))
            | (Guardian.cnic.ilike(like))
        )
    rows = await paginate_scalars(
        session, stmt.order_by(Guardian.name), limit=limit, offset=offset, response=response
    )
    return [GuardianRead.model_validate(row) for row in rows]


@router.get("/guardians/search", response_model=list[GuardianRead])
async def search_guardians(
    response: Response,
    current_user: User = Depends(require_permission("students.view")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
    q: str = Query(..., description="Search query for guardian name, phone, or CNIC"),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> list[GuardianRead]:
    """ISS3-011: Async searchable multi-select for guardians.
    
    Searches across name, phone numbers, and CNIC to help find existing
    guardians and prevent duplicate creation.
    """
    like = f"%{q}%"
    stmt = (
        select(Guardian)
        .where(Guardian.madrasa_id == madrasa.id)
        .where(
            (Guardian.name.ilike(like))
            | (Guardian.phone_numbers.ilike(like))
            | (Guardian.cnic.ilike(like))
        )
        .order_by(Guardian.name)
        .limit(limit)
        .offset(offset)
    )
    rows = await session.execute(stmt)
    return [GuardianRead.model_validate(row) for row in rows.scalars().all()]


@router.get("/guardians/duplicates", response_model=list[GuardianRead])
async def find_duplicate_guardians(
    response: Response,
    current_user: User = Depends(require_permission("students.view")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
    phone: str | None = Query(default=None, description="Phone number to check"),
    cnic: str | None = Query(default=None, description="CNIC to check"),
    limit: int = Query(default=10, ge=1, le=MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
) -> list[GuardianRead]:
    """ISS3-011: Find potential duplicate guardians by phone or CNIC.
    
    Used to surface existing guardians before creating a new one.
    """
    stmt = select(Guardian).where(Guardian.madrasa_id == madrasa.id)
    
    conditions = []
    if phone:
        conditions.append(Guardian.phone_numbers.ilike(f"%{phone}%"))
    if cnic:
        conditions.append(Guardian.cnic == cnic)
    
    if conditions:
        stmt = stmt.where(sqlalchemy_or(*conditions))
    
    rows = await paginate_scalars(
        session,
        stmt.order_by(Guardian.name),
        limit=limit,
        offset=offset,
        response=response,
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
        link = StudentGuardian(
            madrasa_id=madrasa.id,
            student_id=student_id,
            guardian_id=guardian_id,
            relationship=guardian.relationship,
        )
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
        if not student.is_independent and await _student_guardian_count(session, student.id, madrasa.id) <= 1:
            raise HTTPException(status_code=422, detail="A dependent student requires at least one guardian")
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
    response: Response,
    current_user: User = Depends(require_permission("students.view")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
    limit: int = Query(default=DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
) -> list[StudentRead]:
    # Need to verify the guardian belongs to the madrasa
    guardian = await _get_or_404(session, Guardian, guardian_id, madrasa.id)

    stmt = (
        select(StudentProfile)
        .join(StudentGuardian, StudentProfile.id == StudentGuardian.student_id)
        .where(StudentGuardian.guardian_id == guardian_id)
        .where(StudentProfile.madrasa_id == madrasa.id)
    )
    rows = await paginate_scalars(
        session,
        stmt.order_by(StudentProfile.name),
        limit=limit,
        offset=offset,
        response=response,
    )
    return [StudentRead.model_validate(row) for row in rows]


# ---------------------------------------------------------------- Guardian Portal

# Guardian portal endpoints (ISS3-028/029) have been moved to
# backend/app/modules/operations/guardian_portal.py to avoid circular dependencies.
# The following endpoints were removed from this file:
# - GET /guardians/me/forms (uses FormDef from operations.schemas)
# - GET /guardians/me/announcements (uses AnnouncementRead from operations.schemas)

@router.get("/guardians/me/forms")
async def list_guardian_forms_placeholder():
    """Placeholder - endpoint moved to operations/guardian_portal.py"""
    raise HTTPException(status_code=501, detail="Endpoint moved to operations router")

async def _get_or_404(session: AsyncSession, model, record_id: UUID, madrasa_id: UUID):
    record = await session.get(model, record_id)
    if record is None or record.madrasa_id != madrasa_id:
        raise HTTPException(status_code=404, detail=f"{model.__name__} not found")
    return record
