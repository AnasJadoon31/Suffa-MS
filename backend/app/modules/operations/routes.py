from copy import deepcopy
from datetime import UTC, datetime
from time import time
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_madrasa, get_current_user, require_mapped_permission, require_permission
from app.db.session import get_session
from app.modules.academics.models import AcademicSession, Enrollment, Madrasa
from app.modules.auth.models import User, UserRole
from app.modules.operations.models import (
    Announcement,
    Form,
    FormResponse,
    Holiday,
    Leave,
    Resource,
    ResourceCategory,
    TimetableSlot,
)
from app.modules.operations.schemas import (
    AnnouncementCreate,
    AnnouncementRead,
    CreateOperationRecord,
    FormCreate,
    FormRead,
    FormResponseCreate,
    FormResponseRead,
    HolidayCreate,
    HolidayRead,
    LeaveCreate,
    LeaveRead,
    OperationActionResponse,
    OperationModule,
    OperationRecord,
    ResourceCategoryCreate,
    ResourceCategoryRead,
    ResourceCreate,
    ResourceRead,
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


def _visible(scope: dict, viewer_class_id: UUID | None) -> bool:
    if viewer_class_id is None:  # staff/non-student: not scope-restricted
        return True
    if scope.get("all"):
        return True
    return str(viewer_class_id) in {str(c) for c in scope.get("classes", [])}


def _scope_dump(scope) -> dict:
    return scope.model_dump(mode="json") if hasattr(scope, "model_dump") else scope


# ------------------------------------------------------------- Timetable

@router.post("/timetable", response_model=TimetableSlotRead)
async def create_timetable_slot(
    payload: TimetableSlotCreate,
    current_user: User = Depends(require_permission("timetable.manage")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> TimetableSlotRead:
    slot = TimetableSlot(madrasa_id=madrasa.id, **payload.model_dump())
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


@router.get("/timetable", response_model=list[TimetableSlotRead])
async def list_timetable(
    current_user: User = Depends(get_current_user),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
    class_id: UUID | None = None,
    section_id: UUID | None = None,
    teacher_id: UUID | None = None,
) -> list[TimetableSlotRead]:
    stmt = select(TimetableSlot).where(TimetableSlot.madrasa_id == madrasa.id)
    if class_id:
        stmt = stmt.where(TimetableSlot.class_id == class_id)
    if section_id:
        stmt = stmt.where(TimetableSlot.section_id == section_id)
    if teacher_id:
        stmt = stmt.where(TimetableSlot.teacher_id == teacher_id)
    result = await session.execute(stmt.order_by(TimetableSlot.day_of_week, TimetableSlot.period))
    return [TimetableSlotRead.model_validate(row) for row in result.scalars().all()]


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
    current_user: User = Depends(require_permission("timetable.manage")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> HolidayRead:
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


@router.post("/leave", response_model=LeaveRead)
async def create_leave(
    payload: LeaveCreate,
    current_user: User = Depends(require_permission("timetable.manage")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> LeaveRead:
    leave = Leave(madrasa_id=madrasa.id, **payload.model_dump())
    session.add(leave)
    await session.commit()
    await session.refresh(leave)
    return LeaveRead.model_validate(leave)


@router.get("/leave", response_model=list[LeaveRead])
async def list_leave(
    current_user: User = Depends(get_current_user),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
    user_id: UUID | None = None,
) -> list[LeaveRead]:
    stmt = select(Leave).where(Leave.madrasa_id == madrasa.id)
    if user_id:
        stmt = stmt.where(Leave.user_id == user_id)
    result = await session.execute(stmt.order_by(Leave.start_date))
    return [LeaveRead.model_validate(row) for row in result.scalars().all()]


@router.post("/leave/{leave_id}/status", response_model=LeaveRead)
async def set_leave_status(
    leave_id: UUID,
    status_value: str,
    current_user: User = Depends(require_permission("timetable.manage")),
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
    return LeaveRead.model_validate(leave)


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
    viewer_class_id = await _viewer_class_id(session, current_user, madrasa.id)
    return [ResourceRead.model_validate(row) for row in rows if _visible(row.visibility_scope, viewer_class_id)]


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
    viewer_class_id = await _viewer_class_id(session, current_user, madrasa.id)
    return [FormRead.model_validate(row) for row in rows if _visible(row.visibility_scope, viewer_class_id)]


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
) -> list[AnnouncementRead]:
    now = datetime.now(UTC)
    result = await session.execute(
        select(Announcement).where(Announcement.madrasa_id == madrasa.id).order_by(Announcement.created_at.desc())
    )
    rows = result.scalars().all()
    viewer_class_id = await _viewer_class_id(session, current_user, madrasa.id)

    def _live(row: Announcement) -> bool:
        if row.publish_at and now < row.publish_at:
            return False
        if row.expires_at and now > row.expires_at:
            return False
        return _visible(row.audience_scope, viewer_class_id)

    return [AnnouncementRead.model_validate(row) for row in rows if _live(row)]


# --------------------------------------------------------- Remaining mock
# Still-fake areas awaiting their own modules (salary, assignments, results,
# messaging templates, reports, blog, admissions, settings). Each maps to
# the real Appendix A permission it will require once implemented.

MODULE_PERMISSIONS: dict[str, str] = {
    "messaging": "messaging.send",
    "reports": "finance.reports.view",
    "blog": "blog.manage",
    "admissions": "students.provision",
    "settings": "academics.manage",
}

module_store: dict[str, list[dict[str, str]]] = {
    "messaging": [{"id": "msg-1", "recipient": "Abdul Ali", "phone": "923001234567", "state": "Ready"}],
    "reports": [{"id": "rpt-1", "title": "Attendance summary", "period": "June 2026", "state": "Ready"}],
    "blog": [{"id": "post-1", "title": "Attendance with accountability", "author": "Maulana Yusuf", "state": "Draft"}],
    "admissions": [{"id": "adm-1", "student": "Muhammad Umar", "program": "Hifz", "state": "Pending"}],
    "settings": [{"id": "set-1", "key": "Content language", "value": "Urdu", "state": "Saved"}],
}


@router.get("", response_model=list[str])
async def list_modules(current_user: User = Depends(get_current_user)) -> list[str]:
    return sorted(module_store)


@router.get("/{module_key}", response_model=OperationModule)
async def list_records(
    module_key: str,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> OperationModule:
    await require_mapped_permission(module_key, MODULE_PERMISSIONS, current_user, session)
    records = get_module(module_key)
    return OperationModule(key=module_key, records=[to_record(record) for record in records])


@router.post("/{module_key}", response_model=OperationRecord)
async def create_record(
    module_key: str,
    payload: CreateOperationRecord,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> OperationRecord:
    await require_mapped_permission(module_key, MODULE_PERMISSIONS, current_user, session)
    records = get_module(module_key)
    record = {"id": f"{module_key}-{int(time() * 1000)}", **payload.data}
    records.insert(0, record)
    return to_record(record)


@router.post("/{module_key}/{record_id}/actions/{action}", response_model=OperationActionResponse)
async def apply_action(
    module_key: str,
    record_id: str,
    action: str,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> OperationActionResponse:
    await require_mapped_permission(module_key, MODULE_PERMISSIONS, current_user, session)
    records = get_module(module_key)
    record = next((item for item in records if item["id"] == record_id), None)
    if record is None:
        raise HTTPException(status_code=404, detail="Record not found")

    record["state"] = action_to_state(action)
    if action == "send":
        record["link"] = build_whatsapp_link(record)
    return OperationActionResponse(record=to_record(record), message=f"{action} complete")


@router.get("/{module_key}/export/csv")
async def export_csv(
    module_key: str,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict[str, str]:
    await require_mapped_permission(module_key, MODULE_PERMISSIONS, current_user, session)
    records = get_module(module_key)
    columns = sorted({key for record in records for key in record})
    lines = [",".join(columns)]
    lines.extend(",".join(record.get(column, "") for column in columns) for record in records)
    return {"filename": f"{module_key}.csv", "content": "\n".join(lines)}


def get_module(module_key: str) -> list[dict[str, str]]:
    if module_key not in module_store:
        raise HTTPException(status_code=404, detail="Unknown module")
    return module_store[module_key]


def to_record(record: dict[str, str]) -> OperationRecord:
    data = deepcopy(record)
    record_id = data.pop("id")
    return OperationRecord(id=record_id, data=data)


def action_to_state(action: str) -> str:
    states = {
        "approve": "Approved",
        "export": "Exported",
        "publish": "Published",
        "receipt": "Receipted",
        "save": "Saved",
        "send": "Sent",
    }
    return states.get(action, "Updated")


def build_whatsapp_link(record: dict[str, str]) -> str:
    phone = record.get("phone", "923001234567").replace("+", "").replace(" ", "")
    return f"https://wa.me/{phone}?text=MMS%20update%20ready"
