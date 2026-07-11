from datetime import UTC, datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import (
    get_context_session,
    get_current_madrasa,
    get_current_user,
    get_optional_user,
    require_active_session,
    require_permission,
    user_has_permission,
)
from app.db.session import get_session
from app.modules.academics.models import (
    AcademicClass,
    AcademicSession,
    Course,
    Enrollment,
    Madrasa,
    Section,
)
from app.modules.operations.audience import get_viewer_context, scope_allows
from app.modules.auth.models import User, UserRole
from app.modules.operations.models import (
    AdmissionApplication,
    Announcement,
    BlogPost,
    ContactEnquiry,
    Form,
    FormResponse,
    Holiday,
    Leave,
    MadrasaSetting,
    Resource,
    ResourceCategory,
    TimetableSlot,
)
from app.modules.operations.schemas import (
    AdmissionApplicationCreate,
    AdmissionApplicationRead,
    AnnouncementCreate,
    AnnouncementRead,
    AnnouncementUpdate,
    BlogPostCreate,
    BlogPostRead,
    ContactEnquiryCreate,
    ContactEnquiryRead,
    FormCreate,
    FormRead,
    FormResponseCreate,
    FormResponseRead,
    HolidayCreate,
    HolidayRead,
    HolidayUpdate,
    LeaveCreate,
    LeaveRead,
    ResourceCategoryCreate,
    ResourceCategoryRead,
    ResourceCreate,
    ResourceRead,
    SettingRead,
    SettingUpsert,
    TimetableSlotCreate,
    TimetableSlotRead,
)
from app.modules.people.models import StudentProfile, TeacherProfile

router = APIRouter()


# ------------------------------------------------------------- Scope helper

async def _active_session_id(session: AsyncSession, madrasa_id: UUID) -> UUID | None:
    result = await session.execute(
        select(AcademicSession.id).where(AcademicSession.madrasa_id == madrasa_id, AcademicSession.is_active.is_(True))
    )
    return result.scalar_one_or_none()


async def _viewer_class_id(session: AsyncSession, current_user: User, madrasa_id: UUID) -> UUID | None:
    """None means 'not a portal student' — such viewers are not scope-restricted."""
    if current_user.role != UserRole.student:
        return None
    profile = (
        await session.execute(select(StudentProfile).where(StudentProfile.user_id == current_user.id))
    ).scalar_one_or_none()
    if profile is None:
        return None
    active_session_id = await _active_session_id(session, madrasa_id)
    if active_session_id is None:
        return None
    enrollment = (
        await session.execute(
            select(Enrollment).where(Enrollment.student_id == profile.id, Enrollment.session_id == active_session_id)
        )
    ).scalar_one_or_none()
    return enrollment.class_id if enrollment else None


def _visible(scope: dict, viewer_class_id: UUID | None, viewer_role: str | None = None) -> bool:
    if scope.get("all"):
        return True
        
    allowed_roles = scope.get("roles", [])
    if allowed_roles and viewer_role and viewer_role not in allowed_roles:
        return False

    if viewer_class_id is None:  # staff/non-student: not scope-restricted
        return True
    return str(viewer_class_id) in {str(c) for c in scope.get("classes", [])}


def _scope_dump(scope) -> dict:
    return scope.model_dump(mode="json") if hasattr(scope, "model_dump") else scope


def _aware_dt(value: datetime) -> datetime:
    # sqlite (tests) returns naive datetimes; Postgres returns tz-aware.
    return value if value.tzinfo else value.replace(tzinfo=UTC)


def _role_value(role: UserRole | str | None) -> str | None:
    if role is None:
        return None
    return role.value if isinstance(role, UserRole) else str(role)


def _ensure_valid_date_range(start_date, end_date) -> None:
    if end_date < start_date:
        raise HTTPException(status_code=400, detail="End date must be on or after start date")


async def _leave_reads(session: AsyncSession, rows: list[Leave], madrasa_id: UUID) -> list[LeaveRead]:
    user_ids = list({row.user_id for row in rows})
    users_by_id: dict[UUID, User] = {}
    teachers_by_user_id: dict[UUID, TeacherProfile] = {}
    students_by_user_id: dict[UUID, StudentProfile] = {}

    if user_ids:
        users = await session.execute(select(User).where(User.id.in_(user_ids), User.madrasa_id == madrasa_id))
        users_by_id = {user.id: user for user in users.scalars().all()}

        teachers = await session.execute(
            select(TeacherProfile).where(TeacherProfile.user_id.in_(user_ids), TeacherProfile.madrasa_id == madrasa_id)
        )
        teachers_by_user_id = {teacher.user_id: teacher for teacher in teachers.scalars().all()}

        students = await session.execute(
            select(StudentProfile).where(StudentProfile.user_id.in_(user_ids), StudentProfile.madrasa_id == madrasa_id)
        )
        students_by_user_id = {student.user_id: student for student in students.scalars().all()}

    enriched: list[LeaveRead] = []
    for row in rows:
        user = users_by_id.get(row.user_id)
        teacher = teachers_by_user_id.get(row.user_id)
        student = students_by_user_id.get(row.user_id)
        person_name: str | None = None
        person_type: str | None = None

        if user is not None and user.role == UserRole.teacher and teacher:
            person_name = teacher.name
            person_type = "teacher"
        elif user is not None and user.role == UserRole.student and student:
            person_name = student.name
            person_type = "student"
        elif teacher:
            person_name = teacher.name
            person_type = "teacher"
        elif student:
            person_name = student.name
            person_type = "student"
        elif user:
            person_name = user.username
            person_type = _role_value(user.role)

        data = LeaveRead.model_validate(row).model_dump()
        data["person_name"] = person_name
        data["person_type"] = person_type
        enriched.append(LeaveRead(**data))

    return enriched


# ------------------------------------------------------------- Timetable

def _minutes(value: str) -> int:
    hours, minutes = value.split(":")
    return int(hours) * 60 + int(minutes)


def _overlaps(a_start: str, a_end: str, b_start: str, b_end: str) -> bool:
    return _minutes(a_start) < _minutes(b_end) and _minutes(b_start) < _minutes(a_end)


@router.post("/timetable", response_model=TimetableSlotRead)
async def create_timetable_slot(
    payload: TimetableSlotCreate,
    current_user: User = Depends(require_permission("timetable.manage")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    context_session: AcademicSession = Depends(require_active_session),
    session: AsyncSession = Depends(get_session),
) -> TimetableSlotRead:
    if _minutes(payload.end_time) <= _minutes(payload.start_time):
        raise HTTPException(status_code=400, detail="end_time must be after start_time")

    section = await session.get(Section, payload.section_id)
    if section is None or section.madrasa_id != madrasa.id or section.class_id != payload.class_id:
        raise HTTPException(status_code=400, detail="Section does not belong to the given class")
    teacher = await session.get(TeacherProfile, payload.teacher_id)
    if teacher is None or teacher.madrasa_id != madrasa.id:
        raise HTTPException(status_code=404, detail="Teacher not found")

    # Conflict detection: the same teacher or the same section cannot be in
    # two overlapping slots on the same day of the same session.
    day_slots = (
        await session.execute(
            select(TimetableSlot).where(
                TimetableSlot.madrasa_id == madrasa.id,
                TimetableSlot.session_id == context_session.id,
                TimetableSlot.day_of_week == payload.day_of_week,
            )
        )
    ).scalars().all()
    for other in day_slots:
        if not _overlaps(payload.start_time, payload.end_time, other.start_time, other.end_time):
            continue
        if other.teacher_id == payload.teacher_id:
            raise HTTPException(status_code=409, detail=f"Teacher already has a slot {other.start_time}–{other.end_time} that day")
        if other.section_id == payload.section_id:
            raise HTTPException(status_code=409, detail=f"Section already has a slot {other.start_time}–{other.end_time} that day")

    period = payload.period
    if period is None:
        # Auto-derive: 1 + number of distinct earlier start times for this
        # section on this day.
        earlier = {
            other.start_time
            for other in day_slots
            if other.section_id == payload.section_id and _minutes(other.start_time) < _minutes(payload.start_time)
        }
        period = len(earlier) + 1

    slot = TimetableSlot(
        madrasa_id=madrasa.id,
        session_id=context_session.id,
        **payload.model_dump(exclude={"period"}),
        period=period,
    )
    session.add(slot)
    await session.commit()
    await session.refresh(slot)
    return TimetableSlotRead.model_validate(slot)


@router.delete("/timetable/{slot_id}")
async def delete_timetable_slot(
    slot_id: UUID,
    current_user: User = Depends(require_permission("timetable.manage")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> dict[str, str]:
    slot = await session.get(TimetableSlot, slot_id)
    if slot is None or slot.madrasa_id != madrasa.id:
        raise HTTPException(status_code=404, detail="Timetable slot not found")
    await session.delete(slot)
    await session.commit()
    return {"status": "deleted"}


def _enriched_slot(row) -> TimetableSlotRead:
    slot, class_name, section_name, course_name, teacher_name = row
    data = TimetableSlotRead.model_validate(slot).model_dump()
    data.update(
        class_name=class_name,
        section_name=section_name,
        course_name=course_name,
        teacher_name=teacher_name,
    )
    return TimetableSlotRead(**data)


@router.get("/timetable", response_model=list[TimetableSlotRead])
async def list_timetable(
    current_user: User = Depends(get_current_user),
    madrasa: Madrasa = Depends(get_current_madrasa),
    context_session: AcademicSession = Depends(get_context_session),
    session: AsyncSession = Depends(get_session),
    class_id: UUID | None = None,
    section_id: UUID | None = None,
    teacher_id: UUID | None = None,
    course_id: UUID | None = None,
    day_of_week: int | None = None,
) -> list[TimetableSlotRead]:
    stmt = (
        select(TimetableSlot, AcademicClass.name, Section.name, Course.name, TeacherProfile.name)
        .join(AcademicClass, AcademicClass.id == TimetableSlot.class_id)
        .join(Section, Section.id == TimetableSlot.section_id)
        .join(Course, Course.id == TimetableSlot.course_id)
        .join(TeacherProfile, TeacherProfile.id == TimetableSlot.teacher_id)
        .where(
            TimetableSlot.madrasa_id == madrasa.id,
            # Legacy rows predating session stamping stay visible everywhere.
            (TimetableSlot.session_id == context_session.id) | (TimetableSlot.session_id.is_(None)),
        )
    )
    if class_id:
        stmt = stmt.where(TimetableSlot.class_id == class_id)
    if section_id:
        stmt = stmt.where(TimetableSlot.section_id == section_id)
    if teacher_id:
        stmt = stmt.where(TimetableSlot.teacher_id == teacher_id)
    if course_id:
        stmt = stmt.where(TimetableSlot.course_id == course_id)
    if day_of_week is not None:
        stmt = stmt.where(TimetableSlot.day_of_week == day_of_week)
    result = await session.execute(
        stmt.order_by(TimetableSlot.day_of_week, TimetableSlot.start_time, Section.name)
    )
    return [_enriched_slot(row) for row in result.all()]


@router.get("/timetable/me", response_model=list[TimetableSlotRead])
async def my_timetable(
    current_user: User = Depends(get_current_user),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> list[TimetableSlotRead]:
    active_session_id = await _active_session_id(session, madrasa.id)
    if active_session_id is None:
        return []

    if current_user.role == UserRole.student:
        profile = (
            await session.execute(select(StudentProfile).where(StudentProfile.user_id == current_user.id))
        ).scalar_one_or_none()
        if profile is None:
            return []
        enrollment = (
            await session.execute(
                select(Enrollment).where(Enrollment.student_id == profile.id, Enrollment.session_id == active_session_id)
            )
        ).scalar_one_or_none()
        if enrollment is None:
            return []
        stmt = select(TimetableSlot).where(
            TimetableSlot.madrasa_id == madrasa.id,
            TimetableSlot.class_id == enrollment.class_id,
            TimetableSlot.section_id == enrollment.section_id,
        )
    elif current_user.role == UserRole.teacher:
        profile = (
            await session.execute(select(TeacherProfile).where(TeacherProfile.user_id == current_user.id))
        ).scalar_one_or_none()
        if profile is None:
            return []
        stmt = select(TimetableSlot).where(
            TimetableSlot.madrasa_id == madrasa.id,
            TimetableSlot.teacher_id == profile.id,
        )
    else:
        return []

    result = await session.execute(stmt.order_by(TimetableSlot.day_of_week, TimetableSlot.period))
    return [TimetableSlotRead.model_validate(row) for row in result.scalars().all()]


@router.post("/holidays", response_model=HolidayRead)
async def create_holiday(
    payload: HolidayCreate,
    current_user: User = Depends(require_permission("holidays.manage")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> HolidayRead:
    _ensure_valid_date_range(payload.start_date, payload.end_date)
    holiday = Holiday(madrasa_id=madrasa.id, **payload.model_dump())
    session.add(holiday)
    await session.commit()
    await session.refresh(holiday)
    return HolidayRead.model_validate(holiday)


@router.get("/holidays", response_model=list[HolidayRead])
async def list_holidays(
    current_user: User = Depends(get_current_user),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> list[HolidayRead]:
    result = await session.execute(
        select(Holiday).where(Holiday.madrasa_id == madrasa.id).order_by(Holiday.start_date)
    )
    return [HolidayRead.model_validate(row) for row in result.scalars().all()]


@router.put("/holidays/{holiday_id}", response_model=HolidayRead)
async def update_holiday(
    holiday_id: UUID,
    payload: HolidayUpdate,
    current_user: User = Depends(require_permission("holidays.manage")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> HolidayRead:
    _ensure_valid_date_range(payload.start_date, payload.end_date)
    holiday = await session.get(Holiday, holiday_id)
    if holiday is None or holiday.madrasa_id != madrasa.id:
        raise HTTPException(status_code=404, detail="Holiday not found")
    holiday.name = payload.name
    holiday.start_date = payload.start_date
    holiday.end_date = payload.end_date
    await session.commit()
    await session.refresh(holiday)
    return HolidayRead.model_validate(holiday)


@router.delete("/holidays/{holiday_id}")
async def delete_holiday(
    holiday_id: UUID,
    current_user: User = Depends(require_permission("holidays.manage")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> dict[str, str]:
    holiday = await session.get(Holiday, holiday_id)
    if holiday is None or holiday.madrasa_id != madrasa.id:
        raise HTTPException(status_code=404, detail="Holiday not found")
    await session.delete(holiday)
    await session.commit()
    return {"status": "deleted"}


@router.post("/leave", response_model=LeaveRead)
async def create_leave(
    payload: LeaveCreate,
    current_user: User = Depends(get_current_user),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> LeaveRead:
    _ensure_valid_date_range(payload.start_date, payload.end_date)

    can_manage_leave = await user_has_permission(current_user, "timetable.manage", session)
    target_user_id = payload.user_id or current_user.id
    if target_user_id != current_user.id and not can_manage_leave:
        raise HTTPException(status_code=403, detail="You can only request leave for your own account")

    target_user = await session.get(User, target_user_id)
    if target_user is None or target_user.madrasa_id != madrasa.id:
        raise HTTPException(status_code=404, detail="Person not found")
    leave = Leave(
        madrasa_id=madrasa.id,
        user_id=target_user_id,
        start_date=payload.start_date,
        end_date=payload.end_date,
        reason=payload.reason,
    )
    session.add(leave)
    await session.commit()
    await session.refresh(leave)
    return (await _leave_reads(session, [leave], madrasa.id))[0]


@router.get("/leave", response_model=list[LeaveRead])
async def list_leave(
    current_user: User = Depends(get_current_user),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
    user_id: UUID | None = None,
) -> list[LeaveRead]:
    can_manage_leave = await user_has_permission(current_user, "timetable.manage", session)
    stmt = select(Leave).where(Leave.madrasa_id == madrasa.id)
    if user_id:
        if user_id != current_user.id and not can_manage_leave:
            raise HTTPException(status_code=403, detail="You can only view your own leave records")
        stmt = stmt.where(Leave.user_id == user_id)
    elif not can_manage_leave:
        stmt = stmt.where(Leave.user_id == current_user.id)
    result = await session.execute(stmt.order_by(Leave.start_date))
    return await _leave_reads(session, list(result.scalars().all()), madrasa.id)


@router.post("/leave/{leave_id}/status", response_model=LeaveRead)
async def set_leave_status(
    leave_id: UUID,
    status_value: str,
    current_user: User = Depends(require_permission("leave.manage")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> LeaveRead:
    if status_value not in {"pending", "approved", "rejected"}:
        raise HTTPException(status_code=400, detail="status must be pending, approved, or rejected")
    leave = await session.get(Leave, leave_id)
    if leave is None or leave.madrasa_id != madrasa.id:
        raise HTTPException(status_code=404, detail="Leave record not found")
    leave.status = status_value
    await session.commit()
    await session.refresh(leave)
    return (await _leave_reads(session, [leave], madrasa.id))[0]


# --------------------------------------------------------------- Resources

@router.post("/resource-categories", response_model=ResourceCategoryRead)
async def create_resource_category(
    payload: ResourceCategoryCreate,
    current_user: User = Depends(require_permission("resources.manage")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> ResourceCategoryRead:
    category = ResourceCategory(madrasa_id=madrasa.id, name=payload.name)
    session.add(category)
    await session.commit()
    await session.refresh(category)
    return ResourceCategoryRead.model_validate(category)


@router.get("/resource-categories", response_model=list[ResourceCategoryRead])
async def list_resource_categories(
    current_user: User = Depends(get_current_user),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> list[ResourceCategoryRead]:
    result = await session.execute(select(ResourceCategory).where(ResourceCategory.madrasa_id == madrasa.id))
    return [ResourceCategoryRead.model_validate(row) for row in result.scalars().all()]


@router.post("/resources", response_model=ResourceRead)
async def create_resource(
    payload: ResourceCreate,
    current_user: User = Depends(require_permission("resources.manage")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> ResourceRead:
    if not payload.file_key and not payload.video_url:
        raise HTTPException(status_code=400, detail="Provide file_key or video_url")
    resource = Resource(
        madrasa_id=madrasa.id,
        category_id=payload.category_id,
        title=payload.title,
        description=payload.description,
        file_key=payload.file_key,
        video_url=payload.video_url,
        visibility_scope=_scope_dump(payload.visibility_scope),
        created_by_id=current_user.id,
    )
    session.add(resource)
    await session.commit()
    await session.refresh(resource)
    return ResourceRead.model_validate(resource)


@router.get("/resources", response_model=list[ResourceRead])
async def list_resources(
    current_user: User = Depends(get_current_user),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
    category_id: UUID | None = None,
) -> list[ResourceRead]:
    stmt = select(Resource).where(Resource.madrasa_id == madrasa.id)
    if category_id:
        stmt = stmt.where(Resource.category_id == category_id)
    result = await session.execute(stmt.order_by(Resource.title))
    rows = result.scalars().all()
    ctx = await get_viewer_context(session, current_user, madrasa.id)
    return [ResourceRead.model_validate(row) for row in rows if scope_allows(row.visibility_scope, ctx)]


# ------------------------------------------------------------------ Forms

@router.post("/forms", response_model=FormRead)
async def create_form(
    payload: FormCreate,
    current_user: User = Depends(require_permission("forms.create")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> FormRead:
    form = Form(
        madrasa_id=madrasa.id,
        title=payload.title,
        description=payload.description,
        fields_definition=[field.model_dump() for field in payload.fields],
        visibility_scope=_scope_dump(payload.visibility_scope),
        open_from=payload.open_from,
        open_until=payload.open_until,
        allow_multiple=payload.allow_multiple,
        created_by_id=current_user.id,
    )
    session.add(form)
    await session.commit()
    await session.refresh(form)
    return FormRead.model_validate(form)


@router.get("/forms", response_model=list[FormRead])
async def list_forms(
    current_user: User = Depends(get_current_user),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> list[FormRead]:
    result = await session.execute(select(Form).where(Form.madrasa_id == madrasa.id).order_by(Form.title))
    rows = result.scalars().all()
    ctx = await get_viewer_context(session, current_user, madrasa.id)
    return [FormRead.model_validate(row) for row in rows if scope_allows(row.visibility_scope, ctx)]


@router.get("/forms/{form_id}", response_model=FormRead)
async def get_form(
    form_id: UUID,
    current_user: User = Depends(get_current_user),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> FormRead:
    form = await _get_form_or_404(session, form_id, madrasa.id)
    return FormRead.model_validate(form)


@router.post("/forms/{form_id}/responses", response_model=FormResponseRead)
async def submit_form_response(
    form_id: UUID,
    payload: FormResponseCreate,
    current_user: User = Depends(get_current_user),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> FormResponseRead:
    form = await _get_form_or_404(session, form_id, madrasa.id)

    now = datetime.now(UTC)
    if form.open_from and now < form.open_from:
        raise HTTPException(status_code=400, detail="This form is not open yet")
    if form.open_until and now > form.open_until:
        raise HTTPException(status_code=400, detail="This form is closed")

    student = (
        await session.execute(select(StudentProfile).where(StudentProfile.user_id == current_user.id))
    ).scalar_one_or_none()
    if student is None:
        raise HTTPException(status_code=403, detail="Only portal students can submit form responses")

    if not form.allow_multiple:
        existing = await session.execute(
            select(FormResponse).where(FormResponse.form_id == form_id, FormResponse.student_id == student.id)
        )
        if existing.scalar_one_or_none() is not None:
            raise HTTPException(status_code=409, detail="You have already submitted this form")

    response = FormResponse(
        madrasa_id=madrasa.id,
        form_id=form_id,
        student_id=student.id,
        submitted_by_id=current_user.id,
        response_data=payload.response_data,
    )
    session.add(response)
    await session.commit()
    await session.refresh(response)
    return FormResponseRead.model_validate(response)


@router.get("/forms/{form_id}/responses", response_model=list[FormResponseRead])
async def list_form_responses(
    form_id: UUID,
    current_user: User = Depends(require_permission("forms.responses.view")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> list[FormResponseRead]:
    await _get_form_or_404(session, form_id, madrasa.id)
    result = await session.execute(select(FormResponse).where(FormResponse.form_id == form_id))
    return [FormResponseRead.model_validate(row) for row in result.scalars().all()]


async def _get_form_or_404(session: AsyncSession, form_id: UUID, madrasa_id: UUID) -> Form:
    form = await session.get(Form, form_id)
    if form is None or form.madrasa_id != madrasa_id:
        raise HTTPException(status_code=404, detail="Form not found")
    return form


# ------------------------------------------------------------ Announcements

@router.post("/announcements", response_model=AnnouncementRead)
async def create_announcement(
    payload: AnnouncementCreate,
    current_user: User = Depends(require_permission("announcements.post")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> AnnouncementRead:
    announcement = Announcement(
        madrasa_id=madrasa.id,
        title=payload.title,
        body=payload.body,
        attachment_link=payload.attachment_link,
        audience_scope=_scope_dump(payload.audience_scope),
        publish_at=payload.publish_at,
        expires_at=payload.expires_at,
        created_by_id=current_user.id,
    )
    session.add(announcement)
    await session.commit()
    await session.refresh(announcement)
    return AnnouncementRead.model_validate(announcement)


@router.get("/announcements", response_model=list[AnnouncementRead])
async def list_announcements(
    current_user: User = Depends(get_current_user),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
    audience: str | None = None,  # teachers | students | all — the admin tabs
    q: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
) -> list[AnnouncementRead]:
    now = datetime.now(UTC)
    stmt = select(Announcement).where(Announcement.madrasa_id == madrasa.id)
    if q:
        pattern = f"%{q}%"
        stmt = stmt.where(Announcement.title.ilike(pattern) | Announcement.body.ilike(pattern))
    if date_from:
        stmt = stmt.where(Announcement.created_at >= date_from)
    if date_to:
        stmt = stmt.where(Announcement.created_at <= date_to)
    rows = (await session.execute(stmt.order_by(Announcement.created_at.desc()))).scalars().all()
    ctx = await get_viewer_context(session, current_user, madrasa.id)

    def _audience_tab(row: Announcement) -> bool:
        if audience in (None, "all"):
            return True
        scope = row.audience_scope or {}
        roles = scope.get("roles") or []
        wanted = "teacher" if audience == "teachers" else "student"
        # No role gate = addressed to everyone, shows on every tab.
        return not roles or wanted in roles

    def _live(row: Announcement) -> bool:
        if row.publish_at and now < _aware_dt(row.publish_at):
            return False
        if row.expires_at and now > _aware_dt(row.expires_at):
            return False
        return scope_allows(row.audience_scope, ctx) and _audience_tab(row)

    return [AnnouncementRead.model_validate(row) for row in rows if _live(row)]


@router.put("/announcements/{announcement_id}", response_model=AnnouncementRead)
async def update_announcement(
    announcement_id: UUID,
    payload: AnnouncementUpdate,
    current_user: User = Depends(require_permission("announcements.post")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> AnnouncementRead:
    announcement = await session.get(Announcement, announcement_id)
    if not announcement or announcement.madrasa_id != madrasa.id:
        raise HTTPException(status_code=404, detail="Announcement not found")

    if payload.title is not None:
        announcement.title = payload.title
    if payload.body is not None:
        announcement.body = payload.body
    if payload.attachment_link is not None:
        announcement.attachment_link = payload.attachment_link
    if payload.audience_scope is not None:
        announcement.audience_scope = _scope_dump(payload.audience_scope)
    if payload.publish_at is not None:
        announcement.publish_at = payload.publish_at
    if payload.expires_at is not None:
        announcement.expires_at = payload.expires_at

    await session.commit()
    await session.refresh(announcement)
    return AnnouncementRead.model_validate(announcement)


@router.delete("/announcements/{announcement_id}")
async def delete_announcement(
    announcement_id: UUID,
    current_user: User = Depends(require_permission("announcements.post")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> dict:
    announcement = await session.get(Announcement, announcement_id)
    if not announcement or announcement.madrasa_id != madrasa.id:
        raise HTTPException(status_code=404, detail="Announcement not found")

    await session.delete(announcement)
    await session.commit()
    return {"ok": True}


# ------------------------------------------------------------------- Blog

@router.post("/blog", response_model=BlogPostRead)
async def create_blog_post(
    payload: BlogPostCreate,
    current_user: User = Depends(require_permission("blog.manage")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> BlogPostRead:
    post = BlogPost(madrasa_id=madrasa.id, author_id=current_user.id, **payload.model_dump())
    session.add(post)
    await session.commit()
    await session.refresh(post)
    return BlogPostRead.model_validate(post)


@router.get("/blog", response_model=list[BlogPostRead])
async def list_blog_posts(
    current_user: Optional[User] = Depends(get_optional_user),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
    published_only: bool = False,
) -> list[BlogPostRead]:
    # Anonymous visitors (the public marketing site) only ever see published posts.
    stmt = select(BlogPost).where(BlogPost.madrasa_id == madrasa.id)
    if published_only or current_user is None:
        stmt = stmt.where(BlogPost.published.is_(True))
    result = await session.execute(stmt.order_by(BlogPost.created_at.desc()))
    return [BlogPostRead.model_validate(row) for row in result.scalars().all()]


@router.post("/blog/{post_id}/publish", response_model=BlogPostRead)
async def publish_blog_post(
    post_id: UUID,
    current_user: User = Depends(require_permission("blog.manage")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> BlogPostRead:
    post = await session.get(BlogPost, post_id)
    if post is None or post.madrasa_id != madrasa.id:
        raise HTTPException(status_code=404, detail="Blog post not found")
    post.published = True
    await session.commit()
    await session.refresh(post)
    return BlogPostRead.model_validate(post)


# -------------------------------------------------------------- Admissions

@router.post("/admissions", response_model=AdmissionApplicationRead)
async def create_admission_application(
    payload: AdmissionApplicationCreate,
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> AdmissionApplicationRead:
    application = AdmissionApplication(madrasa_id=madrasa.id, **payload.model_dump())
    session.add(application)
    await session.commit()
    await session.refresh(application)
    return AdmissionApplicationRead.model_validate(application)


@router.get("/admissions", response_model=list[AdmissionApplicationRead])
async def list_admission_applications(
    current_user: User = Depends(require_permission("admissions.manage")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> list[AdmissionApplicationRead]:
    result = await session.execute(
        select(AdmissionApplication).where(AdmissionApplication.madrasa_id == madrasa.id).order_by(AdmissionApplication.created_at.desc())
    )
    return [AdmissionApplicationRead.model_validate(row) for row in result.scalars().all()]


@router.post("/admissions/{application_id}/status", response_model=AdmissionApplicationRead)
async def set_admission_status(
    application_id: UUID,
    status_value: str,
    current_user: User = Depends(require_permission("admissions.manage")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> AdmissionApplicationRead:
    if status_value not in {"pending", "accepted", "rejected"}:
        raise HTTPException(status_code=400, detail="status must be pending, accepted, or rejected")
    application = await session.get(AdmissionApplication, application_id)
    if application is None or application.madrasa_id != madrasa.id:
        raise HTTPException(status_code=404, detail="Admission application not found")
    application.status = status_value
    await session.commit()
    await session.refresh(application)
    return AdmissionApplicationRead.model_validate(application)


# --------------------------------------------------------- Contact enquiries

@router.post("/enquiries", response_model=ContactEnquiryRead)
async def create_contact_enquiry(
    payload: ContactEnquiryCreate,
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> ContactEnquiryRead:
    enquiry = ContactEnquiry(madrasa_id=madrasa.id, **payload.model_dump())
    session.add(enquiry)
    await session.commit()
    await session.refresh(enquiry)
    return ContactEnquiryRead.model_validate(enquiry)


@router.get("/enquiries", response_model=list[ContactEnquiryRead])
async def list_contact_enquiries(
    current_user: User = Depends(require_permission("contact.enquiries.view")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> list[ContactEnquiryRead]:
    result = await session.execute(
        select(ContactEnquiry).where(ContactEnquiry.madrasa_id == madrasa.id).order_by(ContactEnquiry.created_at.desc())
    )
    return [ContactEnquiryRead.model_validate(row) for row in result.scalars().all()]


@router.post("/enquiries/{enquiry_id}/status", response_model=ContactEnquiryRead)
async def set_enquiry_status(
    enquiry_id: UUID,
    status_value: str,
    current_user: User = Depends(require_permission("contact.enquiries.view")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> ContactEnquiryRead:
    if status_value not in {"new", "reviewed"}:
        raise HTTPException(status_code=400, detail="status must be new or reviewed")
    enquiry = await session.get(ContactEnquiry, enquiry_id)
    if enquiry is None or enquiry.madrasa_id != madrasa.id:
        raise HTTPException(status_code=404, detail="Enquiry not found")
    enquiry.status = status_value
    await session.commit()
    await session.refresh(enquiry)
    return ContactEnquiryRead.model_validate(enquiry)


# ---------------------------------------------------------------- Settings

@router.get("/settings", response_model=list[SettingRead])
async def list_settings(
    current_user: User = Depends(get_current_user),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> list[SettingRead]:
    result = await session.execute(
        select(MadrasaSetting).where(MadrasaSetting.madrasa_id == madrasa.id).order_by(MadrasaSetting.key)
    )
    return [SettingRead.model_validate(row) for row in result.scalars().all()]


@router.put("/settings", response_model=SettingRead)
async def upsert_setting(
    payload: SettingUpsert,
    current_user: User = Depends(require_permission("settings.manage")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> SettingRead:
    setting = (
        await session.execute(
            select(MadrasaSetting).where(MadrasaSetting.madrasa_id == madrasa.id, MadrasaSetting.key == payload.key)
        )
    ).scalar_one_or_none()
    if setting is None:
        setting = MadrasaSetting(madrasa_id=madrasa.id, key=payload.key, value=payload.value)
        session.add(setting)
    else:
        setting.value = payload.value
    await session.commit()
    await session.refresh(setting)
    return SettingRead.model_validate(setting)
