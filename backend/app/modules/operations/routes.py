from datetime import UTC, date, datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import (
    get_context_session,
    get_current_madrasa,
    get_current_user,
    get_optional_user,
    require_active_session,
    require_permission,
    require_permission_grant,
    require_teacher_or_permission,
    user_has_permission,
)
from app.core.error_codes import ErrorCode
from app.core.pagination import DEFAULT_LIMIT, MAX_LIMIT, paginate_scalars, paginate_sequence
from app.core.teaching_scope import taught_class_ids, teacher_teaches
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
    AdmissionForm,
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
    AdmissionFormCreate,
    AdmissionFormRead,
    AdmissionFormUpdate,
    AnnouncementCreate,
    AnnouncementRead,
    AnnouncementUpdate,
    BlogPostCreate,
    BlogPostRead,
    BlogPostUpdate,
    ContactEnquiryCreate,
    ContactEnquiryRead,
    FormCreate,
    FormRead,
    FormResponseCreate,
    FormResponseRead,
    FormUpdate,
    HolidayCreate,
    HolidayRead,
    HolidayUpdate,
    LeaveCreate,
    LeaveRead,
    ResourceCategoryCreate,
    ResourceCategoryRead,
    ResourceCreate,
    ResourceRead,
    ResourceUpdate,
    Scope,
    SettingRead,
    SettingUpsert,
    TypedSettingRead,
    TimetableImportRequest,
    TimetableImportResponse,
    TimetableImportRowResult,
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


@router.post("/timetable/import", response_model=TimetableImportResponse)
async def import_timetable(
    payload: TimetableImportRequest,
    current_user: User = Depends(require_permission("timetable.manage")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    context_session: AcademicSession = Depends(require_active_session),
    session: AsyncSession = Depends(get_session),
) -> TimetableImportResponse:
    """Bulk slot creation from parsed CSV rows (B3-b). Names are resolved
    case-insensitively; dry_run validates (incl. conflicts against existing
    slots and within the batch) without writing. Nothing is written unless
    every row is valid."""
    classes = {
        name.casefold(): (cid, name)
        for cid, name in (
            await session.execute(select(AcademicClass.id, AcademicClass.name).where(AcademicClass.madrasa_id == madrasa.id))
        ).all()
    }
    sections = {
        (class_id, name.casefold()): sid
        for sid, class_id, name in (
            await session.execute(select(Section.id, Section.class_id, Section.name).where(Section.madrasa_id == madrasa.id))
        ).all()
    }
    courses = {
        name.casefold(): cid
        for cid, name in (
            await session.execute(select(Course.id, Course.name).where(Course.madrasa_id == madrasa.id))
        ).all()
    }
    teachers = {
        code.casefold(): tid
        for tid, code in (
            await session.execute(select(TeacherProfile.id, TeacherProfile.employee_code).where(TeacherProfile.madrasa_id == madrasa.id))
        ).all()
    }
    existing = (
        await session.execute(
            select(TimetableSlot).where(
                TimetableSlot.madrasa_id == madrasa.id,
                TimetableSlot.session_id == context_session.id,
            )
        )
    ).scalars().all()
    busy = [(s.day_of_week, s.teacher_id, s.section_id, s.start_time, s.end_time) for s in existing]

    results: list[TimetableImportRowResult] = []
    staged: list[TimetableSlot] = []
    for index, row in enumerate(payload.rows, start=1):
        error: str | None = None
        class_entry = classes.get(row.class_name.casefold())
        if class_entry is None:
            error = f"Unknown class: {row.class_name}"
        else:
            class_id = class_entry[0]
            section_id = sections.get((class_id, row.section_name.casefold()))
            course_id = courses.get(row.course_name.casefold())
            teacher_id = teachers.get(row.teacher_code.casefold())
            if section_id is None:
                error = f"Unknown section: {row.section_name} in {row.class_name}"
            elif course_id is None:
                error = f"Unknown course: {row.course_name}"
            elif teacher_id is None:
                error = f"Unknown teacher code: {row.teacher_code}"
            elif _minutes(row.end_time) <= _minutes(row.start_time):
                error = "end_time must be after start_time"
            else:
                for day, busy_teacher, busy_section, b_start, b_end in busy:
                    if day != row.day_of_week or not _overlaps(row.start_time, row.end_time, b_start, b_end):
                        continue
                    if busy_teacher == teacher_id:
                        error = f"Teacher busy {b_start}\u2013{b_end}"
                        break
                    if busy_section == section_id:
                        error = f"Section busy {b_start}\u2013{b_end}"
                        break
        if error is None:
            earlier = {
                b_start
                for day, _bt, busy_section, b_start, _be in busy
                if day == row.day_of_week and busy_section == section_id and _minutes(b_start) < _minutes(row.start_time)
            }
            staged.append(
                TimetableSlot(
                    madrasa_id=madrasa.id,
                    session_id=context_session.id,
                    class_id=class_id,
                    section_id=section_id,
                    course_id=course_id,
                    teacher_id=teacher_id,
                    day_of_week=row.day_of_week,
                    period=len(earlier) + 1,
                    start_time=row.start_time,
                    end_time=row.end_time,
                )
            )
            busy.append((row.day_of_week, teacher_id, section_id, row.start_time, row.end_time))
        results.append(TimetableImportRowResult(row=index, ok=error is None, error=error))

    all_ok = all(result.ok for result in results)
    created = 0
    if not payload.dry_run and all_ok:
        for slot in staged:
            session.add(slot)
        created = len(staged)
        await session.commit()
    return TimetableImportResponse(dry_run=payload.dry_run or not all_ok, created=created, results=results)


@router.get("/timetable/export")
async def export_timetable(
    current_user: User = Depends(require_permission("timetable.manage")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    context_session: AcademicSession = Depends(get_context_session),
    session: AsyncSession = Depends(get_session),
    class_id: UUID | None = None,
    format: str = "pdf",
) -> "Response":
    """Whole-madrasa timetable as a PDF: one weekly grid (periods × days) per
    section, stacked in class/section order."""
    from fastapi.responses import Response

    from app.core.pdf import load_report_branding, render_table_pdf

    stmt = (
        select(TimetableSlot, AcademicClass.name, Section.name, Course.name, TeacherProfile.name)
        .join(AcademicClass, AcademicClass.id == TimetableSlot.class_id)
        .join(Section, Section.id == TimetableSlot.section_id)
        .join(Course, Course.id == TimetableSlot.course_id)
        .join(TeacherProfile, TeacherProfile.id == TimetableSlot.teacher_id)
        .where(
            TimetableSlot.madrasa_id == madrasa.id,
            (TimetableSlot.session_id == context_session.id) | (TimetableSlot.session_id.is_(None)),
        )
    )
    if current_user.role == UserRole.teacher:
        teacher_profile_id = (
            await session.execute(
                select(TeacherProfile.id).where(
                    TeacherProfile.madrasa_id == madrasa.id,
                    TeacherProfile.user_id == current_user.id,
                )
            )
        ).scalar_one_or_none()
        if teacher_profile_id is None:
            raise HTTPException(status_code=404, detail="No timetable slots to export")
        stmt = stmt.where(TimetableSlot.teacher_id == teacher_profile_id)
    if class_id:
        stmt = stmt.where(TimetableSlot.class_id == class_id)
    rows = (await session.execute(stmt.order_by(AcademicClass.name, Section.name, TimetableSlot.start_time))).all()
    if not rows:
        raise HTTPException(status_code=404, detail="No timetable slots to export")

    day_names = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    # section key → {"label": str, "slots": {(day, start_time): cell}}
    sections_grid: dict[tuple[str, str], dict] = {}
    for slot, class_name, section_name, course_name, teacher_name in rows:
        key = (class_name, section_name)
        entry = sections_grid.setdefault(key, {"slots": {}})
        entry["slots"][(slot.day_of_week, slot.start_time, slot.end_time)] = f"{course_name}\n{teacher_name}"

    headers = ["Time"] + day_names
    table_rows: list[list[str]] = []
    for (class_name, section_name), entry in sections_grid.items():
        table_rows.append([f"— {class_name} / {section_name} —"] + [""] * len(day_names))
        # Distinct time windows for this section, ordered by start time.
        windows = sorted({(start, end) for (_d, start, end) in entry["slots"]}, key=lambda w: w[0])
        for start, end in windows:
            row = [f"{start}–{end}"]
            for day_index in range(len(day_names)):
                row.append(entry["slots"].get((day_index, start, end), ""))
            table_rows.append(row)

    pdf_bytes = render_table_pdf(
        "Timetable", f"{madrasa.name} — {context_session.name}", headers, table_rows,
        await load_report_branding(session, madrasa),
    )
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="timetable.pdf"'},
    )


@router.get("/admission-forms", response_model=list[AdmissionFormRead])
async def list_admission_forms(
    response: Response,
    category: str | None = None,
    program_id: UUID | None = None,
    limit: int = Query(DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    offset: int = Query(0, ge=0),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> list[AdmissionFormRead]:
    query = select(AdmissionForm).where(AdmissionForm.madrasa_id == madrasa.id)
    if category:
        query = query.where(AdmissionForm.category == category)
    if program_id:
        query = query.where(AdmissionForm.program_id == program_id)
        
    query = query.order_by(AdmissionForm.created_at.desc())
    
    return await paginate_scalars(session, query, limit=limit, offset=offset, response=response)


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


async def _enriched_timetable_slots(
    session: AsyncSession,
    madrasa_id: UUID,
    slots: list[TimetableSlot],
) -> list[TimetableSlotRead]:
    if not slots:
        return []
    class_names = dict((await session.execute(
        select(AcademicClass.id, AcademicClass.name).where(
            AcademicClass.madrasa_id == madrasa_id,
            AcademicClass.id.in_({slot.class_id for slot in slots}),
        )
    )).all())
    section_names = dict((await session.execute(
        select(Section.id, Section.name).where(
            Section.madrasa_id == madrasa_id,
            Section.id.in_({slot.section_id for slot in slots}),
        )
    )).all())
    course_names = dict((await session.execute(
        select(Course.id, Course.name).where(
            Course.madrasa_id == madrasa_id,
            Course.id.in_({slot.course_id for slot in slots}),
        )
    )).all())
    teacher_names = dict((await session.execute(
        select(TeacherProfile.id, TeacherProfile.name).where(
            TeacherProfile.madrasa_id == madrasa_id,
            TeacherProfile.id.in_({slot.teacher_id for slot in slots}),
        )
    )).all())
    return [
        _enriched_slot((
            slot,
            class_names.get(slot.class_id),
            section_names.get(slot.section_id),
            course_names.get(slot.course_id),
            teacher_names.get(slot.teacher_id),
        ))
        for slot in slots
    ]


@router.get("/timetable", response_model=list[TimetableSlotRead])
async def list_timetable(
    response: Response,
    current_user: User = Depends(require_permission("timetable.manage")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    context_session: AcademicSession = Depends(get_context_session),
    session: AsyncSession = Depends(get_session),
    class_id: UUID | None = None,
    section_id: UUID | None = None,
    teacher_id: UUID | None = None,
    course_id: UUID | None = None,
    day_of_week: int | None = None,
    limit: int = Query(default=DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
) -> list[TimetableSlotRead]:
    # Select only the TimetableSlot entity so paginate_scalars' `.scalars()`
    # keeps working; the joins stay in the FROM clause purely to support the
    # Section.name secondary sort below. Enrichment columns (class/section/
    # course/teacher names) are batch-fetched afterwards, for the page only.
    stmt = (
        select(TimetableSlot)
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
    if current_user.role == UserRole.teacher:
        teacher_profile_id = (
            await session.execute(
                select(TeacherProfile.id).where(
                    TeacherProfile.madrasa_id == madrasa.id,
                    TeacherProfile.user_id == current_user.id,
                )
            )
        ).scalar_one_or_none()
        if teacher_profile_id is None:
            response.headers["X-Total-Count"] = "0"
            return []
        stmt = stmt.where(TimetableSlot.teacher_id == teacher_profile_id)
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

    slots = await paginate_scalars(
        session,
        stmt.order_by(TimetableSlot.day_of_week, TimetableSlot.start_time, Section.name),
        limit=limit,
        offset=offset,
        response=response,
    )

    return await _enriched_timetable_slots(session, madrasa.id, list(slots))


@router.get("/timetable/me", response_model=list[TimetableSlotRead])
async def my_timetable(
    response: Response,
    current_user: User = Depends(get_current_user),
    madrasa: Madrasa = Depends(get_current_madrasa),
    context_session: AcademicSession = Depends(get_context_session),
    session: AsyncSession = Depends(get_session),
    limit: int = Query(default=DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
) -> list[TimetableSlotRead]:
    if current_user.role == UserRole.student:
        profile = (
            await session.execute(select(StudentProfile).where(
                StudentProfile.user_id == current_user.id,
                StudentProfile.madrasa_id == madrasa.id,
            ))
        ).scalar_one_or_none()
        if profile is None:
            return []
        enrollment = (
            await session.execute(
                select(Enrollment).where(
                    Enrollment.madrasa_id == madrasa.id,
                    Enrollment.student_id == profile.id,
                    Enrollment.session_id == context_session.id,
                )
            )
        ).scalar_one_or_none()
        if enrollment is None:
            return []
        stmt = select(TimetableSlot).where(
            TimetableSlot.madrasa_id == madrasa.id,
            (TimetableSlot.session_id == context_session.id) | (TimetableSlot.session_id.is_(None)),
            TimetableSlot.class_id == enrollment.class_id,
            TimetableSlot.section_id == enrollment.section_id,
        )
    elif current_user.role == UserRole.teacher:
        profile = (
            await session.execute(select(TeacherProfile).where(
                TeacherProfile.user_id == current_user.id,
                TeacherProfile.madrasa_id == madrasa.id,
            ))
        ).scalar_one_or_none()
        if profile is None:
            return []
        stmt = select(TimetableSlot).where(
            TimetableSlot.madrasa_id == madrasa.id,
            (TimetableSlot.session_id == context_session.id) | (TimetableSlot.session_id.is_(None)),
            TimetableSlot.teacher_id == profile.id,
        )
    else:
        raise HTTPException(status_code=403, detail=ErrorCode.TIMETABLE_SELF_SERVICE_ONLY)

    rows = list(await paginate_scalars(
        session, stmt.order_by(TimetableSlot.day_of_week, TimetableSlot.period), limit=limit, offset=offset, response=response
    ))
    return await _enriched_timetable_slots(session, madrasa.id, rows)


@router.post("/holidays", response_model=HolidayRead)
async def create_holiday(
    payload: HolidayCreate,
    current_user: User = Depends(require_permission("holidays.manage")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> HolidayRead:
    _ensure_valid_date_range(payload.start_date, payload.end_date)
    class_ids = await _validated_class_ids(session, madrasa.id, payload.class_ids)
    holiday = Holiday(
        madrasa_id=madrasa.id,
        **payload.model_dump(exclude={"class_ids"}),
        class_ids=class_ids,
    )
    session.add(holiday)
    await session.commit()
    await session.refresh(holiday)
    return HolidayRead.model_validate(holiday)


async def _validated_class_ids(
    session: AsyncSession, madrasa_id: UUID, class_ids: list[UUID] | None
) -> list[str] | None:
    if not class_ids:
        return None
    for class_id in class_ids:
        academic_class = await session.get(AcademicClass, class_id)
        if academic_class is None or academic_class.madrasa_id != madrasa_id:
            raise HTTPException(status_code=404, detail=f"Class {class_id} not found")
    return [str(class_id) for class_id in class_ids]


@router.get("/holidays", response_model=list[HolidayRead])
async def list_holidays(
    response: Response,
    current_user: User = Depends(get_current_user),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
    category: str | None = None,
    class_id: UUID | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    limit: int = Query(default=DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
) -> list[HolidayRead]:
    stmt = select(Holiday).where(Holiday.madrasa_id == madrasa.id)
    if category:
        stmt = stmt.where(Holiday.category == category)
    if date_from:
        stmt = stmt.where(Holiday.end_date >= date_from)
    if date_to:
        stmt = stmt.where(Holiday.start_date <= date_to)
    stmt = stmt.order_by(Holiday.start_date)

    # Teachers only see global holidays + their own (taught) classes' scoped
    # holidays — not every other class's entries (§C teacher portal scoping).
    allowed_class_ids: set[str] | None = None
    if current_user.role == UserRole.teacher:
        teacher = (
            await session.execute(select(TeacherProfile).where(TeacherProfile.user_id == current_user.id))
        ).scalar_one_or_none()
        if teacher is not None:
            active_session_id = await _active_session_id(session, madrasa.id)
            allowed_class_ids = {
                str(cid) for cid in await taught_class_ids(session, madrasa_id=madrasa.id, teacher_id=teacher.id, session_id=active_session_id)
            }

    if class_id is not None or allowed_class_ids is not None:
        # class_ids is a JSON array; containment can't be filtered portably
        # in SQL, so filter in Python first, then paginate the filtered set.
        all_rows = (await session.execute(stmt)).scalars().all()
        filtered = [row for row in all_rows if not row.class_ids or str(class_id) in row.class_ids] if class_id is not None else all_rows
        if allowed_class_ids is not None:
            filtered = [row for row in filtered if not row.class_ids or any(cid in allowed_class_ids for cid in row.class_ids)]
        response.headers["X-Total-Count"] = str(len(filtered))
        page = filtered[offset : offset + limit]
        return [HolidayRead.model_validate(row) for row in page]

    rows = await paginate_scalars(session, stmt, limit=limit, offset=offset, response=response)
    return [HolidayRead.model_validate(row) for row in rows]


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
    holiday.category = payload.category
    holiday.start_date = payload.start_date
    holiday.end_date = payload.end_date
    holiday.class_ids = await _validated_class_ids(session, madrasa.id, payload.class_ids)
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

    can_manage_leave = await user_has_permission(current_user, "leave.manage", session)
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
    response: Response,
    current_user: User = Depends(get_current_user),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
    user_id: UUID | None = None,
    person_type: str | None = None,  # teacher | student — the two admin tabs
    status_filter: str | None = Query(default=None, alias="status"),
    class_id: UUID | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    q: str | None = None,
    self_only: bool = False,
    limit: int = Query(default=DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
) -> list[LeaveRead]:
    can_manage_leave = await user_has_permission(current_user, "leave.manage", session)
    stmt = select(Leave).where(Leave.madrasa_id == madrasa.id)
    if self_only:
        stmt = stmt.where(Leave.user_id == current_user.id)
    elif user_id:
        if user_id != current_user.id and not can_manage_leave:
            raise HTTPException(status_code=403, detail="You can only view your own leave records")
        stmt = stmt.where(Leave.user_id == user_id)
    elif not can_manage_leave:
        stmt = stmt.where(Leave.user_id == current_user.id)

    if person_type in ("teacher", "student"):
        stmt = stmt.join(User, User.id == Leave.user_id).where(User.role == UserRole(person_type))
    if status_filter:
        stmt = stmt.where(Leave.status == status_filter)
    if date_from:
        stmt = stmt.where(Leave.end_date >= date_from)
    if date_to:
        stmt = stmt.where(Leave.start_date <= date_to)
    if class_id is not None:
        # Students of the given class (active-session enrollment).
        student_user_ids = (
            await session.execute(
                select(StudentProfile.user_id)
                .join(Enrollment, Enrollment.student_id == StudentProfile.id)
                .join(AcademicSession, AcademicSession.id == Enrollment.session_id)
                .where(
                    StudentProfile.madrasa_id == madrasa.id,
                    Enrollment.class_id == class_id,
                    AcademicSession.is_active.is_(True),
                )
            )
        ).scalars().all()
        if not student_user_ids:
            return []
        stmt = stmt.where(Leave.user_id.in_(student_user_ids))

    stmt = stmt.order_by(Leave.start_date)

    if q:
        # person_name is derived (joined) per row, so the text search can
        # only run after enrichment; filter first, then paginate the result.
        all_rows = (await session.execute(stmt)).scalars().all()
        reads = await _leave_reads(session, list(all_rows), madrasa.id)
        needle = q.lower()
        reads = [r for r in reads if r.person_name and needle in r.person_name.lower()]
        response.headers["X-Total-Count"] = str(len(reads))
        return reads[offset : offset + limit]

    rows = await paginate_scalars(session, stmt, limit=limit, offset=offset, response=response)
    return await _leave_reads(session, list(rows), madrasa.id)


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

async def _resource_admin(current_user: User, session: AsyncSession) -> bool:
    return current_user.role == UserRole.principal or await user_has_permission(current_user, "resources.manage_all", session)


async def _require_teachable_scope(
    session: AsyncSession,
    current_user: User,
    madrasa_id: UUID,
    scope: Scope,
    bypass_permission: str,
) -> None:
    """Resources/Forms (B9/B10): a teacher may only target classes/sections/
    courses they actually teach, unless they hold the module's admin-override
    permission. Broadcasting to everyone/a whole role/specific people always
    needs the override — only genuine teaching scope is self-service."""
    if current_user.role == UserRole.principal:
        return
    if await user_has_permission(current_user, bypass_permission, session):
        return
    if current_user.role != UserRole.teacher:
        raise HTTPException(status_code=403, detail="Not permitted to target this audience")

    teacher = (
        await session.execute(select(TeacherProfile).where(TeacherProfile.user_id == current_user.id))
    ).scalar_one_or_none()
    if teacher is None:
        raise HTTPException(status_code=403, detail="Not permitted to target this audience")

    if scope.all or scope.roles or scope.users:
        raise HTTPException(status_code=403, detail="Only an admin can target everyone, a whole role, or specific people")
    if not (scope.classes or scope.sections or scope.courses):
        raise HTTPException(status_code=403, detail="Choose which of your own classes/sections/courses this applies to")

    active_session_id = await _active_session_id(session, madrasa_id)
    for class_id in scope.classes:
        if not await teacher_teaches(session, madrasa_id=madrasa_id, teacher_id=teacher.id, session_id=active_session_id, class_id=class_id):
            raise HTTPException(status_code=403, detail="You do not teach one of the targeted classes")
    for section_id in scope.sections:
        # Resolve the section's class as well so both dimensions must match a
        # real timetable slot.
        section = await session.get(Section, section_id)
        section_class_id = section.class_id if section is not None else None
        if not await teacher_teaches(
            session, madrasa_id=madrasa_id, teacher_id=teacher.id, session_id=active_session_id,
            class_id=section_class_id, section_id=section_id,
        ):
            raise HTTPException(status_code=403, detail="You do not teach one of the targeted sections")
    for course_id in scope.courses:
        if not await teacher_teaches(session, madrasa_id=madrasa_id, teacher_id=teacher.id, session_id=active_session_id, course_id=course_id):
            raise HTTPException(status_code=403, detail="You do not teach one of the targeted courses")


async def _get_resource_category_or_404(session: AsyncSession, category_id: UUID, madrasa_id: UUID) -> ResourceCategory:
    category = await session.get(ResourceCategory, category_id)
    if category is None or category.madrasa_id != madrasa_id:
        raise HTTPException(status_code=404, detail="Category not found")
    return category


def _category_read(row: ResourceCategory, current_user_id: UUID) -> ResourceCategoryRead:
    data = ResourceCategoryRead.model_validate(row).model_dump()
    data["is_mine"] = row.owner_id == current_user_id
    return ResourceCategoryRead(**data)


@router.post("/resource-categories", response_model=ResourceCategoryRead)
async def create_resource_category(
    payload: ResourceCategoryCreate,
    current_user: User = Depends(require_teacher_or_permission("resources.manage")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> ResourceCategoryRead:
    is_admin = await _resource_admin(current_user, session)
    # Plain teachers always get a private category (B9); only an admin/
    # resources.manage_all holder can make one global.
    owner_id = None if (is_admin and payload.is_global) else current_user.id
    category = ResourceCategory(madrasa_id=madrasa.id, name=payload.name, owner_id=owner_id)
    session.add(category)
    await session.commit()
    await session.refresh(category)
    return _category_read(category, current_user.id)


@router.get("/resource-categories", response_model=list[ResourceCategoryRead])
async def list_resource_categories(
    response: Response,
    current_user: User = Depends(get_current_user),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
    limit: int = Query(default=DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
) -> list[ResourceCategoryRead]:
    # Admins see every category (global + every teacher's); everyone else
    # sees only global categories plus their own private ones (B9).
    is_admin = await _resource_admin(current_user, session)
    stmt = select(ResourceCategory).where(ResourceCategory.madrasa_id == madrasa.id)
    if not is_admin:
        stmt = stmt.where((ResourceCategory.owner_id.is_(None)) | (ResourceCategory.owner_id == current_user.id))
    rows = await paginate_scalars(
        session, stmt.order_by(ResourceCategory.name), limit=limit, offset=offset, response=response
    )
    return [_category_read(row, current_user.id) for row in rows]


@router.delete("/resource-categories/{category_id}")
async def delete_resource_category(
    category_id: UUID,
    current_user: User = Depends(require_teacher_or_permission("resources.manage")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> dict[str, str]:
    category = await _get_resource_category_or_404(session, category_id, madrasa.id)
    is_admin = await _resource_admin(current_user, session)
    if category.owner_id != current_user.id and not is_admin:
        raise HTTPException(status_code=403, detail="Not your category")
    in_use = await session.scalar(select(Resource.id).where(Resource.category_id == category_id).limit(1))
    if in_use:
        raise HTTPException(status_code=409, detail="Cannot delete a category that still has resources in it.")
    await session.delete(category)
    await session.commit()
    return {"status": "deleted"}


async def _get_resource_or_404(session: AsyncSession, resource_id: UUID, madrasa_id: UUID) -> Resource:
    resource = await session.get(Resource, resource_id)
    if resource is None or resource.madrasa_id != madrasa_id:
        raise HTTPException(status_code=404, detail="Resource not found")
    return resource


async def _resource_read(session: AsyncSession, resource: Resource) -> ResourceRead:
    owner = await session.get(User, resource.created_by_id)
    owner_name = None
    if owner is not None:
        teacher = (
            await session.execute(select(TeacherProfile).where(TeacherProfile.user_id == owner.id))
        ).scalar_one_or_none()
        owner_name = teacher.name if teacher else owner.username
    data = ResourceRead.model_validate(resource).model_dump()
    data["owner_name"] = owner_name
    return ResourceRead(**data)


@router.post("/resources", response_model=ResourceRead)
async def create_resource(
    payload: ResourceCreate,
    current_user: User = Depends(require_teacher_or_permission("resources.manage")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> ResourceRead:
    if not payload.file_key and not payload.video_url:
        raise HTTPException(status_code=400, detail="Provide file_key or video_url")
    category = await _get_resource_category_or_404(session, payload.category_id, madrasa.id)
    is_admin = await _resource_admin(current_user, session)
    if category.owner_id not in (None, current_user.id) and not is_admin:
        raise HTTPException(status_code=403, detail="Not your category")
    await _require_teachable_scope(session, current_user, madrasa.id, payload.visibility_scope, "resources.manage_all")
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
    return await _resource_read(session, resource)


@router.put("/resources/{resource_id}", response_model=ResourceRead)
async def update_resource(
    resource_id: UUID,
    payload: ResourceUpdate,
    current_user: User = Depends(require_teacher_or_permission("resources.manage")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> ResourceRead:
    resource = await _get_resource_or_404(session, resource_id, madrasa.id)
    is_admin = await _resource_admin(current_user, session)
    if resource.created_by_id != current_user.id and not is_admin:
        raise HTTPException(status_code=403, detail="Not your resource")
    if payload.category_id is not None:
        category = await _get_resource_category_or_404(session, payload.category_id, madrasa.id)
        if category.owner_id not in (None, current_user.id) and not is_admin:
            raise HTTPException(status_code=403, detail="Not your category")
        resource.category_id = payload.category_id
    if payload.title is not None:
        resource.title = payload.title
    if payload.description is not None:
        resource.description = payload.description
    if payload.file_key is not None:
        resource.file_key = payload.file_key
    if payload.video_url is not None:
        resource.video_url = payload.video_url
    if payload.visibility_scope is not None:
        await _require_teachable_scope(session, current_user, madrasa.id, payload.visibility_scope, "resources.manage_all")
        resource.visibility_scope = _scope_dump(payload.visibility_scope)
    await session.commit()
    await session.refresh(resource)
    return await _resource_read(session, resource)


@router.delete("/resources/{resource_id}")
async def delete_resource(
    resource_id: UUID,
    current_user: User = Depends(require_teacher_or_permission("resources.manage")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> dict[str, str]:
    resource = await _get_resource_or_404(session, resource_id, madrasa.id)
    is_admin = await _resource_admin(current_user, session)
    if resource.created_by_id != current_user.id and not is_admin:
        raise HTTPException(status_code=403, detail="Not your resource")
    await session.delete(resource)
    await session.commit()
    return {"status": "deleted"}


@router.get("/resources", response_model=list[ResourceRead])
async def list_resources(
    response: Response,
    current_user: User = Depends(get_current_user),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
    category_id: UUID | None = None,
    class_id: UUID | None = None,
    section_id: UUID | None = None,
    mine_only: bool = False,
    limit: int = Query(default=DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
) -> list[ResourceRead]:
    """class_id/section_id = admin browse-by-class/section (B9): every
    resource whose scope actually covers that class/section, or is global —
    admin/resources.manage_all only. Everyone else always gets their own
    personally-visible list (own uploads ∪ whatever scope_allows them)."""
    is_admin = await _resource_admin(current_user, session)
    stmt = select(Resource).where(Resource.madrasa_id == madrasa.id)
    if category_id:
        stmt = stmt.where(Resource.category_id == category_id)
    if mine_only:
        stmt = stmt.where(Resource.created_by_id == current_user.id)
    rows = (await session.execute(stmt.order_by(Resource.title))).scalars().all()

    if is_admin and (class_id or section_id):
        def _covers(scope: dict) -> bool:
            if scope.get("all"):
                return True
            if class_id and str(class_id) in {str(c) for c in scope.get("classes", [])}:
                return True
            if section_id and str(section_id) in {str(s) for s in scope.get("sections", [])}:
                return True
            return False
        visible = [row for row in rows if _covers(row.visibility_scope or {})]
    else:
        ctx = await get_viewer_context(session, current_user, madrasa.id)
        visible = [
            row for row in rows
            if is_admin or row.created_by_id == current_user.id or scope_allows(row.visibility_scope, ctx)
        ]

    response.headers["X-Total-Count"] = str(len(visible))
    page = visible[offset : offset + limit]
    return [await _resource_read(session, row) for row in page]


# ------------------------------------------------------------------ Forms

async def _form_admin(current_user: User, session: AsyncSession) -> bool:
    return current_user.role == UserRole.principal or await user_has_permission(current_user, "forms.manage_all", session)


@router.post("/forms", response_model=FormRead)
async def create_form(
    payload: FormCreate,
    current_user: User = Depends(require_permission_grant("forms.create")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> FormRead:
    await _require_teachable_scope(session, current_user, madrasa.id, payload.visibility_scope, "forms.manage_all")
    form = Form(
        madrasa_id=madrasa.id,
        title=payload.title,
        description=payload.description,
        category=payload.category,
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


@router.put("/forms/{form_id}", response_model=FormRead)
async def update_form(
    form_id: UUID,
    payload: FormUpdate,
    current_user: User = Depends(require_permission_grant("forms.create")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> FormRead:
    form = await _get_form_or_404(session, form_id, madrasa.id)
    is_admin = await _form_admin(current_user, session)
    if form.created_by_id != current_user.id and not is_admin:
        raise HTTPException(status_code=403, detail="Not your form")
    if payload.title is not None:
        form.title = payload.title
    if payload.category is not None:
        form.category = payload.category
    if payload.description is not None:
        form.description = payload.description
    if payload.category is not None:
        form.category = payload.category
    if payload.fields is not None:
        form.fields_definition = [field.model_dump() for field in payload.fields]
    if payload.open_from is not None:
        form.open_from = payload.open_from
    if payload.open_until is not None:
        form.open_until = payload.open_until
    if payload.allow_multiple is not None:
        form.allow_multiple = payload.allow_multiple
    if payload.visibility_scope is not None:
        await _require_teachable_scope(session, current_user, madrasa.id, payload.visibility_scope, "forms.manage_all")
        form.visibility_scope = _scope_dump(payload.visibility_scope)
    await session.commit()
    await session.refresh(form)
    return FormRead.model_validate(form)


@router.delete("/forms/{form_id}")
async def delete_form(
    form_id: UUID,
    current_user: User = Depends(require_permission_grant("forms.create")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> dict[str, str]:
    form = await _get_form_or_404(session, form_id, madrasa.id)
    is_admin = await _form_admin(current_user, session)
    if form.created_by_id != current_user.id and not is_admin:
        raise HTTPException(status_code=403, detail="Not your form")
    await session.execute(delete(FormResponse).where(FormResponse.form_id == form.id))
    await session.delete(form)
    await session.commit()
    return {"status": "deleted"}


@router.get("/forms", response_model=list[FormRead])
async def list_forms(
    response: Response,
    current_user: User = Depends(get_current_user),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
    category: str | None = None,
    mine_only: bool = False,
    limit: int = Query(default=DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
) -> list[FormRead]:
    stmt = select(Form).where(Form.madrasa_id == madrasa.id)
    if category:
        stmt = stmt.where(Form.category == category)
    if mine_only:
        stmt = stmt.where(Form.created_by_id == current_user.id)
    rows = (await session.execute(stmt.order_by(Form.title))).scalars().all()
    is_admin = await _form_admin(current_user, session)
    ctx = await get_viewer_context(session, current_user, madrasa.id)
    # scope_allows is a Python-side visibility check, so filter before paging.
    visible = [
        row for row in rows
        if is_admin or row.created_by_id == current_user.id or scope_allows(row.visibility_scope, ctx)
    ]
    response.headers["X-Total-Count"] = str(len(visible))
    page = visible[offset : offset + limit]
    return [FormRead.model_validate(row) for row in page]


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
    
    is_admin = await _form_admin(current_user, session)
    ctx = await get_viewer_context(session, current_user, madrasa.id)
    
    if not is_admin and form.created_by_id != current_user.id and not scope_allows(form.visibility_scope, ctx):
        raise HTTPException(status_code=403, detail="You do not have permission to submit this form")

    student_id = student.id if student else None

    if not form.allow_multiple:
        existing_query = select(FormResponse).where(FormResponse.form_id == form_id)
        if student_id:
            existing_query = existing_query.where(FormResponse.student_id == student_id)
        else:
            existing_query = existing_query.where(FormResponse.submitted_by_id == current_user.id)
            
        existing = await session.execute(existing_query)
        if existing.scalar_one_or_none() is not None:
            raise HTTPException(status_code=409, detail="You have already submitted this form")

    response = FormResponse(
        madrasa_id=madrasa.id,
        form_id=form_id,
        student_id=student_id,
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
    response: Response,
    current_user: User = Depends(require_permission("forms.responses.view")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
    limit: int = Query(default=DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
) -> list[FormResponseRead]:
    await _get_form_or_404(session, form_id, madrasa.id)
    responses = await paginate_scalars(
        session,
        select(FormResponse).where(FormResponse.form_id == form_id).order_by(FormResponse.created_at),
        limit=limit, offset=offset, response=response,
    )
    student_ids = {r.student_id for r in responses}
    names: dict[UUID, str] = {}
    if student_ids:
        rows = await session.execute(
            select(StudentProfile.id, StudentProfile.name).where(StudentProfile.id.in_(student_ids))
        )
        names = dict(rows.all())
    return [
        FormResponseRead(**FormResponseRead.model_validate(row).model_dump(exclude={"student_name"}), student_name=names.get(row.student_id))
        for row in responses
    ]


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
        category=payload.category,
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
    response: Response,
    current_user: User = Depends(get_current_user),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
    audience: str | None = None,  # teachers | students | all — the admin tabs
    category: str | None = None,
    q: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    limit: int = Query(default=DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
) -> list[AnnouncementRead]:
    now = datetime.now(UTC)
    stmt = select(Announcement).where(Announcement.madrasa_id == madrasa.id)
    if category:
        stmt = stmt.where(Announcement.category == category)
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

    # _live combines time-window and Python-side visibility checks, so
    # filter first, then paginate the filtered set.
    live = [row for row in rows if _live(row)]
    response.headers["X-Total-Count"] = str(len(live))
    page = live[offset : offset + limit]
    return [AnnouncementRead.model_validate(row) for row in page]


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
    if payload.category is not None:
        announcement.category = payload.category
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
    response: Response,
    current_user: User = Depends(get_current_user),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
    published_only: bool = False,
    limit: int = Query(default=DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
) -> list[BlogPostRead]:
    # The public feed has its own endpoint. Inside the authenticated app only
    # principals/blog managers may see drafts.
    stmt = select(BlogPost).where(BlogPost.madrasa_id == madrasa.id)
    can_manage_blog = await user_has_permission(current_user, "blog.manage", session)
    if published_only or not can_manage_blog:
        stmt = stmt.where(BlogPost.published.is_(True))
    rows = await paginate_scalars(
        session, stmt.order_by(BlogPost.created_at.desc()), limit=limit, offset=offset, response=response
    )
    return [BlogPostRead.model_validate(row) for row in rows]


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


@router.put("/blog/{post_id}", response_model=BlogPostRead)
async def update_blog_post(
    post_id: UUID,
    payload: BlogPostUpdate,
    current_user: User = Depends(require_permission("blog.manage")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> BlogPostRead:
    post = await session.get(BlogPost, post_id)
    if post is None or post.madrasa_id != madrasa.id:
        raise HTTPException(status_code=404, detail="Blog post not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(post, field, value)
    await session.commit()
    await session.refresh(post)
    return BlogPostRead.model_validate(post)


@router.delete("/blog/{post_id}")
async def delete_blog_post(
    post_id: UUID,
    current_user: User = Depends(require_permission("blog.manage")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> dict[str, str]:
    post = await session.get(BlogPost, post_id)
    if post is None or post.madrasa_id != madrasa.id:
        raise HTTPException(status_code=404, detail="Blog post not found")
    await session.delete(post)
    await session.commit()
    return {"status": "deleted"}


# -------------------------------------------------------------- Admissions

async def _admission_form_read(session: AsyncSession, form: AdmissionForm) -> AdmissionFormRead:
    from app.modules.academics.models import Program

    program = await session.get(Program, form.program_id)
    data = AdmissionFormRead.model_validate(form).model_dump()
    data["program_name"] = program.name if program else None
    return AdmissionFormRead(**data)


@router.post("/admission-forms", response_model=AdmissionFormRead)
async def create_admission_form(
    payload: AdmissionFormCreate,
    current_user: User = Depends(require_permission("admissions.manage")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> AdmissionFormRead:
    from app.modules.academics.models import Program
    import secrets as _secrets

    if payload.program_id:
        program = await session.get(Program, payload.program_id)
        if program is None or program.madrasa_id != madrasa.id:
            raise HTTPException(status_code=404, detail="Program not found")

    form = AdmissionForm(
        madrasa_id=madrasa.id,
        program_id=payload.program_id,
        title=payload.title,
        category=payload.category,
        description=payload.description,
        fields_definition=[field.model_dump() for field in payload.fields],
        public_token=_secrets.token_urlsafe(24),
        created_by_id=current_user.id,
    )
    session.add(form)
    await session.commit()
    await session.refresh(form)
    return await _admission_form_read(session, form)


@router.get("/admission-forms", response_model=list[AdmissionFormRead])
async def list_admission_forms(
    response: Response,
    current_user: User = Depends(require_permission("admissions.manage")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
    limit: int = Query(default=DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
) -> list[AdmissionFormRead]:
    stmt = select(AdmissionForm).where(AdmissionForm.madrasa_id == madrasa.id).order_by(AdmissionForm.created_at.desc())
    rows = await paginate_scalars(session, stmt, limit=limit, offset=offset, response=response)
    return [await _admission_form_read(session, row) for row in rows]


@router.put("/admission-forms/{form_id}", response_model=AdmissionFormRead)
async def update_admission_form(
    form_id: UUID,
    payload: AdmissionFormUpdate,
    current_user: User = Depends(require_permission("admissions.manage")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> AdmissionFormRead:
    form = await session.get(AdmissionForm, form_id)
    if form is None or form.madrasa_id != madrasa.id:
        raise HTTPException(status_code=404, detail="Admission form not found")
    updates = payload.model_dump(exclude_unset=True)
    if "fields" in updates:
        fields = updates.pop("fields")
        form.fields_definition = fields if fields is not None else []
    for field, value in updates.items():
        setattr(form, field, value)
    await session.commit()
    await session.refresh(form)
    return await _admission_form_read(session, form)


@router.delete("/admission-forms/{form_id}")
async def delete_admission_form(
    form_id: UUID,
    current_user: User = Depends(require_permission("admissions.manage")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> dict[str, str]:
    form = await session.get(AdmissionForm, form_id)
    if form is None or form.madrasa_id != madrasa.id:
        raise HTTPException(status_code=404, detail="Admission form not found")
    has_applications = await session.scalar(
        select(AdmissionApplication.id).where(
            AdmissionApplication.madrasa_id == madrasa.id,
            AdmissionApplication.form_id == form.id,
        ).limit(1)
    )
    if has_applications is not None:
        from sqlalchemy import update
        await session.execute(
            update(AdmissionApplication).where(AdmissionApplication.form_id == form.id).values(form_id=None)
        )
    await session.delete(form)
    await session.commit()
    return {"status": "deleted"}


@router.post("/admissions", response_model=AdmissionApplicationRead)
async def create_admission_application(
    payload: AdmissionApplicationCreate,
    current_user: User = Depends(require_permission("admissions.manage")),
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
    response: Response,
    current_user: User = Depends(require_permission("admissions.manage")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
    limit: int = Query(default=DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
) -> list[AdmissionApplicationRead]:
    stmt = (
        select(AdmissionApplication)
        .where(AdmissionApplication.madrasa_id == madrasa.id)
        .order_by(AdmissionApplication.created_at.desc())
    )
    rows = await paginate_scalars(session, stmt, limit=limit, offset=offset, response=response)
    return [AdmissionApplicationRead.model_validate(row) for row in rows]


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
    response: Response,
    current_user: User = Depends(require_permission("contact.enquiries.view")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
    limit: int = Query(default=DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
) -> list[ContactEnquiryRead]:
    stmt = select(ContactEnquiry).where(ContactEnquiry.madrasa_id == madrasa.id).order_by(ContactEnquiry.created_at.desc())
    rows = await paginate_scalars(session, stmt, limit=limit, offset=offset, response=response)
    return [ContactEnquiryRead.model_validate(row) for row in rows]


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
    response: Response,
    current_user: User = Depends(get_current_user),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
    limit: int = Query(default=DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
) -> list[SettingRead]:
    rows = await paginate_scalars(
        session,
        select(MadrasaSetting).where(MadrasaSetting.madrasa_id == madrasa.id).order_by(MadrasaSetting.key),
        limit=limit, offset=offset, response=response,
    )
    return [SettingRead.model_validate(row) for row in rows]


@router.get("/settings/catalog", response_model=list[TypedSettingRead])
async def list_settings_catalog(
    response: Response,
    current_user: User = Depends(get_current_user),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
    limit: int = Query(default=DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
) -> list[TypedSettingRead]:
    """Every defined setting with its stored (or default) value, categorised —
    drives the real settings page (§7). Readable by all madrasa members."""
    from app.core.settings_catalog import CATALOG

    stored = {
        row.key: row.value
        for row in (
            await session.execute(select(MadrasaSetting).where(MadrasaSetting.madrasa_id == madrasa.id))
        ).scalars().all()
    }
    return paginate_sequence([
        TypedSettingRead(
            key=item.key,
            category=item.category,
            type=item.type,
            label=item.label,
            value=stored.get(item.key, item.default),
        )
        for item in CATALOG
    ], limit=limit, offset=offset, response=response)


@router.put("/settings", response_model=SettingRead)
async def upsert_setting(
    payload: SettingUpsert,
    current_user: User = Depends(require_permission("settings.manage")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> SettingRead:
    from app.core.settings_catalog import validate_setting

    try:
        validate_setting(payload.key, payload.value)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

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
