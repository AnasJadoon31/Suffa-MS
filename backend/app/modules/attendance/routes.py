import json
from collections import defaultdict
from datetime import UTC, date, datetime, time
from uuid import NAMESPACE_URL, UUID, uuid5

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError

from app.core.audit import record_audit
from app.core.dependencies import get_context_session, get_current_madrasa, get_current_user, require_permission, user_has_permission
from app.core.error_codes import ErrorCode
from app.core.pagination import DEFAULT_LIMIT, MAX_LIMIT, paginate_scalars, paginate_sequence
from app.core.teaching_scope import taught_class_ids, taught_pairs
from app.db.session import get_session
from app.modules.auth.models import User, UserRole
from app.modules.academics.models import AcademicClass, AcademicSession, ClassCourse, Course, Enrollment, Madrasa, Section
from app.modules.attendance.models import AttendanceCorrection, StudentAttendance, TeacherAttendance
from app.modules.attendance.schemas import (
    AttendanceClassRead,
    AttendanceEntry,
    AttendanceLogEntry,
    AttendanceMarkerRead,
    AttendanceOverrideRequest,
    AttendanceOverrideResponse,
    AttendanceRosterResponse,
    AttendanceRosterStudent,
    AttendanceSectionRead,
    AttendanceStatus,
    AttendanceSummary,
    AttendanceDayBreakdown,
    AttendanceSyncRequest,
    AttendanceSyncResponse,
    ClassAttendanceHistoryResponse,
    StudentAttendanceHistoryResponse,
    TeacherAttendanceLogEntry,
    TeacherAttendanceTodayResponse,
)
from app.modules.operations.models import Holiday, Leave, TimetableSlot
from app.modules.people.models import StudentProfile, TeacherProfile

router = APIRouter()


def lock_cutoff(attendance_date: date) -> datetime:
    return datetime.combine(attendance_date, time(23, 59), tzinfo=UTC)


def is_locked(attendance_date: date, now: datetime | None = None) -> bool:
    return (now or datetime.now(UTC)) > lock_cutoff(attendance_date)


# kept for backwards compatibility with any existing callers/tests
def is_synced_late(captured_at: datetime) -> bool:
    return is_locked(captured_at.date(), captured_at)


def _record_snapshot(record: StudentAttendance | TeacherAttendance) -> dict[str, str | None]:
    snapshot: dict[str, str | None] = {
        "status": str(record.status.value if hasattr(record.status, "value") else record.status),
        "marked_at": record.marked_at.isoformat() if record.marked_at else None,
    }
    if isinstance(record, TeacherAttendance):
        snapshot["check_in"] = record.check_in.isoformat() if record.check_in else None
        snapshot["check_out"] = record.check_out.isoformat() if record.check_out else None
    return snapshot


def _iter_days(start_date: date, end_date: date):
    current = start_date
    while current <= end_date:
        yield current
        current = date.fromordinal(current.toordinal() + 1)


def record_correction(
    session: AsyncSession,
    *,
    madrasa_id: UUID,
    record: StudentAttendance | TeacherAttendance,
    old_values: dict,
    new_values: dict,
    actor_id: UUID,
    reason: str,
) -> None:
    session.add(
        AttendanceCorrection(
            madrasa_id=madrasa_id,
            attendance_table=type(record).__tablename__,
            attendance_id=record.id,
            old_value=json.dumps(old_values),
            new_value=json.dumps(new_values),
            actor_id=actor_id,
            reason=reason,
        )
    )


def apply_entry(record: StudentAttendance | TeacherAttendance, entry: AttendanceEntry, marked_by_id: UUID) -> None:
    record.status = entry.status
    record.marked_at = entry.captured_at
    record.marked_by_id = marked_by_id
    if isinstance(record, TeacherAttendance):
        record.check_in = entry.check_in
        record.check_out = entry.check_out


def _entry_changes_record(record: StudentAttendance | TeacherAttendance, entry: AttendanceEntry) -> bool:
    current_status = str(record.status.value if hasattr(record.status, "value") else record.status)
    if current_status != str(entry.status.value):
        return True
    if isinstance(record, TeacherAttendance):
        return record.check_in != entry.check_in or record.check_out != entry.check_out
    return False


def build_record(entry: AttendanceEntry, madrasa_id: UUID, marked_by_id: UUID, overridden: bool = False):
    common = dict(
        madrasa_id=madrasa_id,
        session_id=entry.session_id,
        attendance_date=entry.attendance_date,
        status=entry.status,
        marked_at=entry.captured_at,
        marked_by_id=marked_by_id,
        idempotency_key=entry.idempotency_key,
        synced_late=overridden,
        overridden=overridden,
    )
    if entry.subject_type == "student":
        return StudentAttendance(
            student_id=entry.subject_id,
            course_id=entry.course_id,
            timetable_slot_id=entry.timetable_slot_id,
            **common,
        )
    return TeacherAttendance(
        teacher_id=entry.subject_id,
        check_in=entry.check_in,
        check_out=entry.check_out,
        **common,
    )


async def _require_student_attendance_access(current_user: User, session: AsyncSession) -> None:
    if current_user.role == "teacher":
        return
    if await user_has_permission(current_user, "attendance.take", session):
        return
    if await user_has_permission(current_user, "students.attendance.manage", session):
        return
    raise HTTPException(status_code=403, detail="Missing permission: attendance.take")


async def _has_global_student_attendance_access(current_user: User, session: AsyncSession) -> bool:
    if current_user.role == UserRole.principal:
        return True
    return await user_has_permission(current_user, "students.attendance.manage", session)


async def _active_session(session: AsyncSession, madrasa_id: UUID) -> AcademicSession | None:
    return (
        await session.execute(
            select(AcademicSession).where(AcademicSession.madrasa_id == madrasa_id, AcademicSession.is_active.is_(True))
        )
    ).scalar_one_or_none()


async def _current_teacher_id(current_user: User, session: AsyncSession, madrasa_id: UUID) -> UUID | None:
    return (
        await session.execute(
            select(TeacherProfile.id).where(
                TeacherProfile.user_id == current_user.id,
                TeacherProfile.madrasa_id == madrasa_id,
                TeacherProfile.status == "active",
            )
        )
    ).scalar_one_or_none()


async def _teacher_assignment_class_ids(
    current_user: User,
    session: AsyncSession,
    madrasa_id: UUID,
    session_id: UUID,
) -> set[UUID]:
    teacher_id = await _current_teacher_id(current_user, session, madrasa_id)
    if teacher_id is None:
        return set()
    # Timetable slots are the sole source of teaching scope.
    return await taught_class_ids(
        session, madrasa_id=madrasa_id, teacher_id=teacher_id, session_id=session_id
    )


async def _assert_can_mark_class(
    current_user: User,
    session: AsyncSession,
    madrasa_id: UUID,
    session_id: UUID,
    class_id: UUID,
) -> None:
    if await _has_global_student_attendance_access(current_user, session):
        return
    assigned_class_ids = await _teacher_assignment_class_ids(current_user, session, madrasa_id, session_id)
    if class_id not in assigned_class_ids:
        raise HTTPException(status_code=403, detail="Attendance access is not assigned for this class")


async def _assert_can_mark_section(
    current_user: User,
    session: AsyncSession,
    madrasa_id: UUID,
    session_id: UUID,
    class_id: UUID,
    section_id: UUID,
) -> None:
    if await _has_global_student_attendance_access(current_user, session):
        return
    teacher_id = await _current_teacher_id(current_user, session, madrasa_id)
    pairs = await taught_pairs(
        session, madrasa_id=madrasa_id, teacher_id=teacher_id, session_id=session_id
    ) if teacher_id else []
    if not any(pair.class_id == class_id and pair.section_id == section_id for pair in pairs):
        raise HTTPException(status_code=403, detail=ErrorCode.ATTENDANCE_SECTION_NOT_ASSIGNED)


async def _assert_can_mark_entry(
    current_user: User,
    session: AsyncSession,
    madrasa_id: UUID,
    entry: AttendanceEntry,
) -> None:
    if entry.subject_type == "teacher":
        if await user_has_permission(current_user, "teachers.attendance.manage", session):
            return
        teacher_id = await _current_teacher_id(current_user, session, madrasa_id)
        if current_user.role == UserRole.teacher and teacher_id == entry.subject_id:
            return
        raise HTTPException(status_code=403, detail="Missing permission: teachers.attendance.manage")

    enrollment_scope = (
        await session.execute(
            select(Enrollment.class_id, Enrollment.section_id).where(
                Enrollment.madrasa_id == madrasa_id,
                Enrollment.student_id == entry.subject_id,
                Enrollment.session_id == entry.session_id,
                Enrollment.ended_on.is_(None),
            )
        )
    ).one_or_none()
    if enrollment_scope is None:
        raise HTTPException(status_code=403, detail="Student is not enrolled in this session")
    class_id, section_id = enrollment_scope

    slot = None
    if entry.timetable_slot_id is not None:
        slot = await session.get(TimetableSlot, entry.timetable_slot_id)
        if (
            slot is None
            or slot.madrasa_id != madrasa_id
            or slot.session_id != entry.session_id
            or slot.class_id != class_id
            or slot.section_id != section_id
            or slot.course_id != entry.course_id
            or slot.day_of_week != entry.attendance_date.weekday()
        ):
            raise HTTPException(status_code=403, detail=ErrorCode.ATTENDANCE_SLOT_NOT_ASSIGNED)

    if await _has_global_student_attendance_access(current_user, session):
        return
    if slot is not None:
        teacher_id = await _current_teacher_id(current_user, session, madrasa_id)
        if teacher_id is None or slot.teacher_id != teacher_id:
            raise HTTPException(status_code=403, detail=ErrorCode.ATTENDANCE_SLOT_NOT_ASSIGNED)
    await _assert_can_mark_section(
        current_user, session, madrasa_id, entry.session_id, class_id, section_id
    )


@router.get("/classes", response_model=list[AttendanceClassRead])
async def attendance_classes(
    response: Response,
    current_user: User = Depends(get_current_user),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
    limit: int = Query(default=DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
) -> list[AttendanceClassRead]:
    await _require_student_attendance_access(current_user, session)
    active_session = await _active_session(session, madrasa.id)
    if active_session is None:
        response.headers["X-Total-Count"] = "0"
        return []

    is_global = await _has_global_student_attendance_access(current_user, session)
    assigned_course_ids: set[UUID] = set()
    assigned_section_ids: set[UUID] | None = None
    class_stmt = select(AcademicClass.id, AcademicClass.name).where(AcademicClass.madrasa_id == madrasa.id)

    if not is_global:
        teacher_id = await _current_teacher_id(current_user, session, madrasa.id)
        if teacher_id is None:
            response.headers["X-Total-Count"] = "0"
            return []
        pairs = await taught_pairs(
            session, madrasa_id=madrasa.id, teacher_id=teacher_id, session_id=active_session.id
        )
        assigned_class_ids = {pair.class_id for pair in pairs}
        assigned_course_ids = {pair.course_id for pair in pairs}
        assigned_section_ids = {pair.section_id for pair in pairs}
        if not assigned_class_ids:
            response.headers["X-Total-Count"] = "0"
            return []
        class_stmt = class_stmt.where(AcademicClass.id.in_(assigned_class_ids))

    class_rows = (await session.execute(class_stmt.order_by(AcademicClass.name))).all()
    class_ids = [row[0] for row in class_rows]
    if not class_ids:
        response.headers["X-Total-Count"] = "0"
        return []

    section_stmt = select(Section.id, Section.class_id, Section.name).where(
        Section.madrasa_id == madrasa.id,
        Section.class_id.in_(class_ids),
    )
    if assigned_section_ids is not None:
        section_stmt = section_stmt.where(Section.id.in_(assigned_section_ids))
    section_rows = (await session.execute(section_stmt.order_by(Section.name))).all()
    visible_section_ids = [row[0] for row in section_rows]

    count_rows = (
        await session.execute(
            select(Enrollment.section_id, func.count(StudentProfile.id))
            .join(StudentProfile, StudentProfile.id == Enrollment.student_id)
            .where(
                Enrollment.madrasa_id == madrasa.id,
                Enrollment.session_id == active_session.id,
                Enrollment.class_id.in_(class_ids),
                Enrollment.section_id.in_(visible_section_ids),
                Enrollment.ended_on.is_(None),
                StudentProfile.status == "active",
            )
            .group_by(Enrollment.section_id)
        )
    ).all()
    section_student_counts = {row[0]: row[1] for row in count_rows}
    sections_by_class: defaultdict[UUID, list[AttendanceSectionRead]] = defaultdict(list)
    for section_id, class_id, section_name in section_rows:
        sections_by_class[class_id].append(
            AttendanceSectionRead(
                id=section_id,
                name=section_name,
                student_count=section_student_counts.get(section_id, 0),
            )
        )

    course_stmt = (
        select(ClassCourse.class_id, Course.id, Course.name)
        .join(Course, Course.id == ClassCourse.course_id)
        .where(
            ClassCourse.madrasa_id == madrasa.id,
            ClassCourse.class_id.in_(class_ids),
        )
    )
    if assigned_course_ids:
        course_stmt = course_stmt.where(ClassCourse.course_id.in_(assigned_course_ids))
    course_rows = (await session.execute(course_stmt.order_by(Course.name))).all()
    course_names: defaultdict[UUID, list[str]] = defaultdict(list)
    courses: defaultdict[UUID, list[dict[str, object]]] = defaultdict(list)
    for class_id, course_id, course_name in course_rows:
        course_names[class_id].append(course_name)
        courses[class_id].append({"id": course_id, "name": course_name})

    return paginate_sequence([
        AttendanceClassRead(
            id=class_id,
            name=class_name,
            course_names=course_names[class_id],
            courses=courses[class_id],
            student_count=sum(section.student_count for section in sections_by_class[class_id]),
            sections=sections_by_class[class_id],
        )
        for class_id, class_name in class_rows
    ], limit=limit, offset=offset, response=response)


@router.get("/classes/{class_id}/roster", response_model=AttendanceRosterResponse)
async def attendance_class_roster(
    class_id: UUID,
    section_id: UUID | None = None,
    course_id: UUID | None = None,
    timetable_slot_id: UUID | None = None,
    current_user: User = Depends(get_current_user),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> AttendanceRosterResponse:
    await _require_student_attendance_access(current_user, session)
    active_session = await _active_session(session, madrasa.id)
    if active_session is None:
        raise HTTPException(status_code=409, detail="No active academic session")

    academic_class = await session.get(AcademicClass, class_id)
    if academic_class is None or academic_class.madrasa_id != madrasa.id:
        raise HTTPException(status_code=404, detail="Class not found")

    section = None
    if (course_id is None) != (timetable_slot_id is None):
        raise HTTPException(status_code=422, detail="course_id and timetable_slot_id must be provided together")
    if section_id is not None:
        section = await session.get(Section, section_id)
        if section is None or section.madrasa_id != madrasa.id or section.class_id != class_id:
            raise HTTPException(status_code=404, detail=ErrorCode.SECTION_NOT_FOUND)
        await _assert_can_mark_section(
            current_user, session, madrasa.id, active_session.id, class_id, section_id
        )
    elif not await _has_global_student_attendance_access(current_user, session):
        raise HTTPException(status_code=403, detail=ErrorCode.ATTENDANCE_SECTION_REQUIRED)

    course = None
    timetable_slot = None
    if timetable_slot_id is not None:
        timetable_slot = await session.get(TimetableSlot, timetable_slot_id)
        if (
            timetable_slot is None
            or timetable_slot.madrasa_id != madrasa.id
            or timetable_slot.session_id != active_session.id
            or timetable_slot.class_id != class_id
            or timetable_slot.course_id != course_id
            or (section_id is not None and timetable_slot.section_id != section_id)
        ):
            raise HTTPException(status_code=404, detail="Attendance timetable slot not found")
        course = await session.get(Course, course_id)
        if course is None or course.madrasa_id != madrasa.id:
            raise HTTPException(status_code=404, detail="Course not found")
        if section_id is None:
            section_id = timetable_slot.section_id
            section = await session.get(Section, section_id)
        await _assert_can_mark_section(
            current_user, session, madrasa.id, active_session.id, class_id, timetable_slot.section_id
        )
        if not await _has_global_student_attendance_access(current_user, session):
            teacher_id = await _current_teacher_id(current_user, session, madrasa.id)
            if teacher_id is None or timetable_slot.teacher_id != teacher_id:
                raise HTTPException(status_code=403, detail=ErrorCode.ATTENDANCE_SLOT_NOT_ASSIGNED)

    roster_stmt = (
        select(
                StudentProfile.id,
                StudentProfile.admission_number,
                StudentProfile.name,
                Section.id,
                Section.name,
            )
            .join(Enrollment, Enrollment.student_id == StudentProfile.id)
            .outerjoin(Section, Section.id == Enrollment.section_id)
            .where(
                Enrollment.madrasa_id == madrasa.id,
                Enrollment.session_id == active_session.id,
                Enrollment.class_id == class_id,
                Enrollment.ended_on.is_(None),
                StudentProfile.status == "active",
            )
            .order_by(Section.name, StudentProfile.name)
    )
    if section_id is not None:
        roster_stmt = roster_stmt.where(Enrollment.section_id == section_id)
    elif current_user.role == UserRole.teacher and not await _has_global_student_attendance_access(current_user, session):
        teacher_id = await _current_teacher_id(current_user, session, madrasa.id)
        pairs = await taught_pairs(
            session, madrasa_id=madrasa.id, teacher_id=teacher_id, session_id=active_session.id
        ) if teacher_id else []
        roster_stmt = roster_stmt.where(Enrollment.section_id.in_({pair.section_id for pair in pairs}))
    rows = (await session.execute(roster_stmt)).all()

    return AttendanceRosterResponse(
        session_id=active_session.id,
        session_name=active_session.name,
        class_id=academic_class.id,
        class_name=academic_class.name,
        section_id=section_id,
        section_name=section.name if section is not None else None,
        course={"id": course.id, "name": course.name} if course is not None else None,
        timetable_slot={
            "id": timetable_slot.id,
            "period": timetable_slot.period,
            "day_of_week": timetable_slot.day_of_week,
            "start_time": timetable_slot.start_time,
            "end_time": timetable_slot.end_time,
        } if timetable_slot is not None else None,
        students=[
            AttendanceRosterStudent(
                id=student_id,
                admission_number=admission_number,
                name=name,
                section_id=section_id,
                section_name=section_name,
            )
            for student_id, admission_number, name, section_id, section_name in rows
        ],
    )


def _history_entry_from_row(row) -> AttendanceLogEntry:
    (
        attendance_id,
        attendance_date,
        student_id,
        admission_number,
        student_name,
        status,
        marked_at,
        created_at,
        updated_at,
        marker_id,
        marker_username,
        marker_role,
        marker_display_name,
        overridden,
        course_id,
        course_name,
        timetable_slot_id,
        slot_period,
        slot_day_of_week,
        slot_start_time,
        slot_end_time,
    ) = row
    synced_at = updated_at or created_at
    return AttendanceLogEntry(
        id=attendance_id,
        attendance_date=attendance_date,
        student_id=student_id,
        student_name=student_name,
        admission_number=admission_number,
        status=status,
        marked_at=marked_at,
        synced_at=synced_at,
        marked_by=AttendanceMarkerRead(
            id=marker_id,
            username=marker_username,
            display_name=marker_display_name or marker_username,
            role=str(marker_role.value if hasattr(marker_role, "value") else marker_role),
        ),
        overridden=overridden,
        course={"id": course_id, "name": course_name} if course_id is not None else None,
        timetable_slot={
            "id": timetable_slot_id,
            "period": slot_period,
            "day_of_week": slot_day_of_week,
            "start_time": slot_start_time,
            "end_time": slot_end_time,
        } if timetable_slot_id is not None else None,
        legacy_general=timetable_slot_id is None,
    )


async def _approved_leave_history_entries(
    session: AsyncSession,
    *,
    madrasa_id: UUID,
    student_ids: set[UUID],
    start_date: date,
    end_date: date,
    enrollment_windows: dict[UUID, list[tuple[date, date]]] | None = None,
) -> list[AttendanceLogEntry]:
    if not student_ids:
        return []

    rows = (
        await session.execute(
            select(
                StudentProfile.id,
                StudentProfile.admission_number,
                StudentProfile.name,
                Leave.id,
                Leave.start_date,
                Leave.end_date,
                Leave.created_at,
                Leave.updated_at,
                User.id,
                User.username,
                User.role,
            )
            .join(Leave, Leave.user_id == StudentProfile.user_id)
            .join(User, User.id == StudentProfile.user_id)
            .where(
                StudentProfile.madrasa_id == madrasa_id,
                StudentProfile.id.in_(student_ids),
                Leave.madrasa_id == madrasa_id,
                Leave.status == "approved",
                Leave.start_date <= end_date,
                Leave.end_date >= start_date,
            )
        )
    ).all()

    entries: list[AttendanceLogEntry] = []
    seen_days: set[tuple[UUID, date]] = set()
    for (
        student_id,
        admission_number,
        student_name,
        leave_id,
        leave_start,
        leave_end,
        leave_created_at,
        leave_updated_at,
        user_id,
        username,
        role,
    ) in rows:
        for day in _iter_days(max(leave_start, start_date), min(leave_end, end_date)):
            if enrollment_windows is not None and not any(
                window_start <= day <= window_end
                for window_start, window_end in enrollment_windows.get(student_id, [])
            ):
                continue
            day_key = (student_id, day)
            if day_key in seen_days:
                continue
            seen_days.add(day_key)
            entries.append(
                AttendanceLogEntry(
                    id=uuid5(NAMESPACE_URL, f"suffa-ms:approved-leave:{leave_id}:{student_id}:{day.isoformat()}"),
                    attendance_date=day,
                    student_id=student_id,
                    student_name=student_name,
                    admission_number=admission_number,
                    status=AttendanceStatus.leave,
                    marked_at=leave_updated_at or leave_created_at,
                    synced_at=leave_updated_at or leave_created_at,
                    marked_by=AttendanceMarkerRead(
                        id=user_id,
                        username=username,
                        display_name=student_name,
                        role=str(role.value if hasattr(role, "value") else role),
                    ),
                    overridden=False,
                    source="approved_leave",
                    locked_reason="approved_leave",
                    leave_id=leave_id,
                )
            )
    return entries


def _merge_approved_leave_entries(
    manual_entries: list[AttendanceLogEntry],
    approved_leave_entries: list[AttendanceLogEntry],
) -> list[AttendanceLogEntry]:
    locked_days = {(entry.student_id, entry.attendance_date) for entry in approved_leave_entries}
    visible_manual = [
        entry for entry in manual_entries
        if (entry.student_id, entry.attendance_date) not in locked_days
    ]
    return sorted(
        [*visible_manual, *approved_leave_entries],
        key=lambda entry: (-entry.attendance_date.toordinal(), entry.student_name),
    )


async def _student_has_approved_leave(
    session: AsyncSession,
    *,
    madrasa_id: UUID,
    student_id: UUID,
    attendance_date: date,
) -> bool:
    return (
        await session.execute(
            select(Leave.id)
            .join(StudentProfile, StudentProfile.user_id == Leave.user_id)
            .where(
                StudentProfile.madrasa_id == madrasa_id,
                StudentProfile.id == student_id,
                Leave.madrasa_id == madrasa_id,
                Leave.status == "approved",
                Leave.start_date <= attendance_date,
                Leave.end_date >= attendance_date,
            )
        )
    ).scalar_one_or_none() is not None


async def _teacher_history_entries(
    session: AsyncSession,
    *,
    madrasa_id: UUID,
    session_id: UUID,
    teacher_id: UUID | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
    limit: int,
    offset: int,
    response: Response,
) -> list[TeacherAttendanceLogEntry]:
    # Paginate on the bare TeacherAttendance entity (joined only for ordering,
    # not for output columns) so `paginate_scalars`'s `.scalars()` returns
    # real ORM rows; display fields (teacher/marker names) are then resolved
    # in bulk for just this page, not the whole matching set.
    stmt = (
        select(TeacherAttendance)
        .join(TeacherProfile, TeacherProfile.id == TeacherAttendance.teacher_id)
        .where(
            TeacherAttendance.madrasa_id == madrasa_id,
            TeacherAttendance.session_id == session_id,
        )
    )
    if teacher_id is not None:
        stmt = stmt.where(TeacherAttendance.teacher_id == teacher_id)
    if start_date is not None:
        stmt = stmt.where(TeacherAttendance.attendance_date >= start_date)
    if end_date is not None:
        stmt = stmt.where(TeacherAttendance.attendance_date <= end_date)

    records = await paginate_scalars(
        session,
        stmt.order_by(TeacherAttendance.attendance_date.desc(), TeacherProfile.name),
        limit=limit,
        offset=offset,
        response=response,
    )
    if not records:
        return []

    teacher_ids = {record.teacher_id for record in records}
    marker_user_ids = {record.marked_by_id for record in records}

    teacher_rows = (
        await session.execute(
            select(TeacherProfile.id, TeacherProfile.name, TeacherProfile.employee_code).where(
                TeacherProfile.id.in_(teacher_ids)
            )
        )
    ).all()
    teacher_map = {row[0]: (row[1], row[2]) for row in teacher_rows}

    marker_teacher = TeacherProfile.__table__.alias("marker_teacher")
    marker_rows = (
        await session.execute(
            select(User.id, User.username, User.role, marker_teacher.c.name)
            .select_from(User)
            .outerjoin(marker_teacher, marker_teacher.c.user_id == User.id)
            .where(User.id.in_(marker_user_ids))
        )
    ).all()
    marker_map = {row[0]: (row[1], row[2], row[3]) for row in marker_rows}

    entries: list[TeacherAttendanceLogEntry] = []
    for record in records:
        teacher_name, employee_code = teacher_map[record.teacher_id]
        marker_username, marker_role, marker_display_name = marker_map[record.marked_by_id]
        synced_at = record.updated_at or record.created_at
        entries.append(
            TeacherAttendanceLogEntry(
                id=record.id,
                teacher_id=record.teacher_id,
                teacher_name=teacher_name,
                employee_code=employee_code,
                attendance_date=record.attendance_date,
                status=record.status,
                check_in=record.check_in,
                check_out=record.check_out,
                marked_at=record.marked_at,
                synced_at=synced_at,
                marked_by=AttendanceMarkerRead(
                    id=record.marked_by_id,
                    username=marker_username,
                    display_name=marker_display_name or marker_username,
                    role=str(marker_role.value if hasattr(marker_role, "value") else marker_role),
                ),
                overridden=record.overridden,
            )
        )
    return entries


async def _class_history_entries(
    session: AsyncSession,
    *,
    madrasa_id: UUID,
    session_id: UUID,
    class_id: UUID,
    section_id: UUID | None = None,
    student_id: UUID | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
    course_id: UUID | None = None,
) -> list[AttendanceLogEntry]:
    stmt = (
        select(
            StudentAttendance.id,
            StudentAttendance.attendance_date,
            StudentProfile.id,
            StudentProfile.admission_number,
            StudentProfile.name,
            StudentAttendance.status,
            StudentAttendance.marked_at,
            StudentAttendance.created_at,
            StudentAttendance.updated_at,
            User.id,
            User.username,
            User.role,
            TeacherProfile.name,
            StudentAttendance.overridden,
            Course.id,
            Course.name,
            TimetableSlot.id,
            TimetableSlot.period,
            TimetableSlot.day_of_week,
            TimetableSlot.start_time,
            TimetableSlot.end_time,
        )
        .select_from(StudentAttendance)
        .join(StudentProfile, StudentProfile.id == StudentAttendance.student_id)
        .join(
            Enrollment,
            and_(
                Enrollment.student_id == StudentAttendance.student_id,
                Enrollment.session_id == StudentAttendance.session_id,
                Enrollment.madrasa_id == madrasa_id,
            ),
        )
        .join(User, User.id == StudentAttendance.marked_by_id)
        .outerjoin(TeacherProfile, TeacherProfile.user_id == User.id)
        .outerjoin(Course, Course.id == StudentAttendance.course_id)
        .outerjoin(TimetableSlot, TimetableSlot.id == StudentAttendance.timetable_slot_id)
        .where(
            StudentAttendance.madrasa_id == madrasa_id,
            StudentAttendance.session_id == session_id,
            Enrollment.class_id == class_id,
            Enrollment.started_on <= StudentAttendance.attendance_date,
            or_(
                Enrollment.ended_on.is_(None),
                Enrollment.ended_on >= StudentAttendance.attendance_date,
            ),
        )
    )
    if student_id is not None:
        stmt = stmt.where(StudentAttendance.student_id == student_id)
    if section_id is not None:
        stmt = stmt.where(Enrollment.section_id == section_id)
    if start_date is not None:
        stmt = stmt.where(StudentAttendance.attendance_date >= start_date)
    if end_date is not None:
        stmt = stmt.where(StudentAttendance.attendance_date <= end_date)
    if course_id is not None:
        stmt = stmt.where(StudentAttendance.course_id == course_id)
    rows = (
        await session.execute(
            stmt.order_by(StudentAttendance.attendance_date.desc(), StudentProfile.name)
        )
    ).all()
    manual_entries = [_history_entry_from_row(row) for row in rows]

    if start_date is None or end_date is None:
        return manual_entries

    enrollment_stmt = select(
        Enrollment.student_id,
        Enrollment.started_on,
        Enrollment.ended_on,
    ).where(
        Enrollment.madrasa_id == madrasa_id,
        Enrollment.session_id == session_id,
        Enrollment.class_id == class_id,
        Enrollment.started_on <= end_date,
        or_(Enrollment.ended_on.is_(None), Enrollment.ended_on >= start_date),
    )
    if section_id is not None:
        enrollment_stmt = enrollment_stmt.where(Enrollment.section_id == section_id)
    if student_id is not None:
        enrollment_stmt = enrollment_stmt.where(Enrollment.student_id == student_id)
    enrollment_rows = (await session.execute(enrollment_stmt)).all()
    enrollment_windows: dict[UUID, list[tuple[date, date]]] = defaultdict(list)
    for enrolled_student_id, enrolled_start, enrolled_end in enrollment_rows:
        enrollment_windows[enrolled_student_id].append(
            (max(enrolled_start, start_date), min(enrolled_end or end_date, end_date))
        )
    student_ids = set(enrollment_windows)

    approved_leave_entries = await _approved_leave_history_entries(
        session,
        madrasa_id=madrasa_id,
        student_ids=student_ids,
        start_date=start_date,
        end_date=end_date,
        enrollment_windows=enrollment_windows,
    )
    return _merge_approved_leave_entries(manual_entries, approved_leave_entries)


@router.get("/classes/{class_id}/history", response_model=ClassAttendanceHistoryResponse)
async def attendance_class_history(
    class_id: UUID,
    section_id: UUID | None = None,
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    course_id: UUID | None = None,
    current_user: User = Depends(get_current_user),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> ClassAttendanceHistoryResponse:
    await _require_student_attendance_access(current_user, session)
    active_session = await _active_session(session, madrasa.id)
    if active_session is None:
        raise HTTPException(status_code=409, detail="No active academic session")

    academic_class = await session.get(AcademicClass, class_id)
    if academic_class is None or academic_class.madrasa_id != madrasa.id:
        raise HTTPException(status_code=404, detail="Class not found")

    if section_id is not None:
        section = await session.get(Section, section_id)
        if section is None or section.madrasa_id != madrasa.id or section.class_id != class_id:
            raise HTTPException(status_code=404, detail=ErrorCode.SECTION_NOT_FOUND)
        await _assert_can_mark_section(
            current_user, session, madrasa.id, active_session.id, class_id, section_id
        )
    elif not await _has_global_student_attendance_access(current_user, session):
        raise HTTPException(status_code=403, detail=ErrorCode.ATTENDANCE_SECTION_REQUIRED)

    effective_start = start_date or active_session.gregorian_start
    effective_end = end_date or active_session.gregorian_end
    entries = await _class_history_entries(
        session,
        madrasa_id=madrasa.id,
        session_id=active_session.id,
        class_id=class_id,
        section_id=section_id,
        start_date=effective_start,
        end_date=effective_end,
        course_id=course_id,
    )
    return ClassAttendanceHistoryResponse(
        session_id=active_session.id,
        session_name=active_session.name,
        class_id=academic_class.id,
        class_name=academic_class.name,
        entries=entries,
    )


@router.get("/classes/{class_id}/students/{student_id}/history", response_model=StudentAttendanceHistoryResponse)
async def attendance_student_history(
    class_id: UUID,
    student_id: UUID,
    section_id: UUID | None = None,
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    course_id: UUID | None = None,
    current_user: User = Depends(get_current_user),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> StudentAttendanceHistoryResponse:
    await _require_student_attendance_access(current_user, session)
    active_session = await _active_session(session, madrasa.id)
    if active_session is None:
        raise HTTPException(status_code=409, detail="No active academic session")

    academic_class = await session.get(AcademicClass, class_id)
    if academic_class is None or academic_class.madrasa_id != madrasa.id:
        raise HTTPException(status_code=404, detail="Class not found")

    if section_id is not None:
        section = await session.get(Section, section_id)
        if section is None or section.madrasa_id != madrasa.id or section.class_id != class_id:
            raise HTTPException(status_code=404, detail=ErrorCode.SECTION_NOT_FOUND)
        await _assert_can_mark_section(
            current_user, session, madrasa.id, active_session.id, class_id, section_id
        )
    elif not await _has_global_student_attendance_access(current_user, session):
        raise HTTPException(status_code=403, detail=ErrorCode.ATTENDANCE_SECTION_REQUIRED)

    effective_start = start_date or active_session.gregorian_start
    effective_end = end_date or active_session.gregorian_end
    student_stmt = (
        select(StudentProfile.id, StudentProfile.admission_number, StudentProfile.name, Section.id, Section.name)
        .join(Enrollment, Enrollment.student_id == StudentProfile.id)
        .outerjoin(Section, Section.id == Enrollment.section_id)
        .where(
            Enrollment.madrasa_id == madrasa.id,
            Enrollment.session_id == active_session.id,
            Enrollment.class_id == class_id,
            StudentProfile.id == student_id,
            Enrollment.started_on <= effective_end,
            or_(Enrollment.ended_on.is_(None), Enrollment.ended_on >= effective_start),
            StudentProfile.status == "active",
        )
    )
    if section_id is not None:
        student_stmt = student_stmt.where(Enrollment.section_id == section_id)
    student_row = (await session.execute(student_stmt)).first()
    if student_row is None:
        raise HTTPException(status_code=404, detail="Student not found in this class")

    entries = await _class_history_entries(
        session,
        madrasa_id=madrasa.id,
        session_id=active_session.id,
        class_id=class_id,
        section_id=section_id,
        student_id=student_id,
        start_date=effective_start,
        end_date=effective_end,
        course_id=course_id,
    )
    return StudentAttendanceHistoryResponse(
        session_id=active_session.id,
        session_name=active_session.name,
        class_id=academic_class.id,
        class_name=academic_class.name,
        student=AttendanceRosterStudent(
            id=student_row[0],
            admission_number=student_row[1],
            name=student_row[2],
            section_id=student_row[3],
            section_name=student_row[4],
        ),
        entries=entries,
    )


@router.get("/students/me/history", response_model=StudentAttendanceHistoryResponse)
async def my_student_attendance_history(
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    course_id: UUID | None = None,
    current_user: User = Depends(get_current_user),
    madrasa: Madrasa = Depends(get_current_madrasa),
    context_session: AcademicSession = Depends(get_context_session),
    session: AsyncSession = Depends(get_session),
) -> StudentAttendanceHistoryResponse:
    """Return only the authenticated student's attendance for the selected session."""
    student = (
        await session.execute(
            select(StudentProfile).where(
                StudentProfile.user_id == current_user.id,
                StudentProfile.madrasa_id == madrasa.id,
                StudentProfile.status == "active",
            )
        )
    ).scalar_one_or_none()
    if student is None:
        raise HTTPException(status_code=403, detail=ErrorCode.STUDENT_SELF_ATTENDANCE_ONLY)

    enrollment = (
        await session.execute(
            select(Enrollment).where(
                Enrollment.madrasa_id == madrasa.id,
                Enrollment.session_id == context_session.id,
                Enrollment.student_id == student.id,
                Enrollment.ended_on.is_(None),
            )
        )
    ).scalar_one_or_none()
    if enrollment is None:
        raise HTTPException(status_code=404, detail=ErrorCode.STUDENT_NOT_ENROLLED)

    academic_class = await session.get(AcademicClass, enrollment.class_id)
    if academic_class is None or academic_class.madrasa_id != madrasa.id:
        raise HTTPException(status_code=404, detail=ErrorCode.CLASS_NOT_FOUND)
    section = None
    if enrollment.section_id:
        section = (
            await session.execute(
                select(Section).where(Section.id == enrollment.section_id, Section.madrasa_id == madrasa.id)
            )
        ).scalar_one_or_none()
    entries = await _class_history_entries(
        session,
        madrasa_id=madrasa.id,
        session_id=context_session.id,
        class_id=enrollment.class_id,
        student_id=student.id,
        start_date=start_date or context_session.gregorian_start,
        end_date=end_date or context_session.gregorian_end,
        course_id=course_id,
    )
    return StudentAttendanceHistoryResponse(
        session_id=context_session.id,
        session_name=context_session.name,
        class_id=academic_class.id,
        class_name=academic_class.name,
        student=AttendanceRosterStudent(
            id=student.id,
            admission_number=student.admission_number,
            name=student.name,
            section_id=section.id if section else None,
            section_name=section.name if section else None,
        ),
        entries=entries,
    )


async def _teacher_today_response(
    session: AsyncSession,
    *,
    madrasa_id: UUID,
    session_id: UUID,
    teacher: TeacherProfile,
    attendance_date: date,
) -> TeacherAttendanceTodayResponse:
    record = (
        await session.execute(
            select(TeacherAttendance).where(
                TeacherAttendance.madrasa_id == madrasa_id,
                TeacherAttendance.session_id == session_id,
                TeacherAttendance.teacher_id == teacher.id,
                TeacherAttendance.attendance_date == attendance_date,
            )
        )
    ).scalar_one_or_none()
    return TeacherAttendanceTodayResponse(
        session_id=session_id,
        teacher_id=teacher.id,
        teacher_name=teacher.name,
        attendance_date=attendance_date,
        id=record.id if record else None,
        status=record.status if record else None,
        check_in=record.check_in if record else None,
        check_out=record.check_out if record else None,
    )


async def _current_teacher_profile_or_404(current_user: User, session: AsyncSession, madrasa_id: UUID) -> TeacherProfile:
    teacher = (
        await session.execute(
            select(TeacherProfile).where(
                TeacherProfile.user_id == current_user.id,
                TeacherProfile.madrasa_id == madrasa_id,
                TeacherProfile.status == "active",
            )
        )
    ).scalar_one_or_none()
    if teacher is None:
        raise HTTPException(status_code=404, detail="Teacher profile not found")
    return teacher


@router.get("/teachers/me/today", response_model=TeacherAttendanceTodayResponse)
async def my_teacher_attendance_today(
    current_user: User = Depends(get_current_user),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> TeacherAttendanceTodayResponse:
    active_session = await _active_session(session, madrasa.id)
    if active_session is None:
        raise HTTPException(status_code=409, detail="No active academic session")
    teacher = await _current_teacher_profile_or_404(current_user, session, madrasa.id)
    today = datetime.now(UTC).date()
    return await _teacher_today_response(
        session,
        madrasa_id=madrasa.id,
        session_id=active_session.id,
        teacher=teacher,
        attendance_date=today,
    )


@router.post("/teachers/me/check-in", response_model=TeacherAttendanceTodayResponse)
async def teacher_check_in(
    current_user: User = Depends(get_current_user),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> TeacherAttendanceTodayResponse:
    active_session = await _active_session(session, madrasa.id)
    if active_session is None:
        raise HTTPException(status_code=409, detail="No active academic session")
    teacher = await _current_teacher_profile_or_404(current_user, session, madrasa.id)
    now = datetime.now(UTC)
    today = now.date()
    record = (
        await session.execute(
            select(TeacherAttendance).where(
                TeacherAttendance.madrasa_id == madrasa.id,
                TeacherAttendance.session_id == active_session.id,
                TeacherAttendance.teacher_id == teacher.id,
                TeacherAttendance.attendance_date == today,
            )
        )
    ).scalar_one_or_none()
    if record is None:
        record = TeacherAttendance(
            madrasa_id=madrasa.id,
            teacher_id=teacher.id,
            session_id=active_session.id,
            attendance_date=today,
            status=AttendanceStatus.present,
            check_in=now.time().replace(tzinfo=None, microsecond=0),
            marked_at=now,
            marked_by_id=current_user.id,
            idempotency_key=f"{teacher.id}:{active_session.id}:{today}",
        )
        session.add(record)
    elif record.check_in is None:
        old_values = _record_snapshot(record)
        record.check_in = now.time().replace(tzinfo=None, microsecond=0)
        record.status = AttendanceStatus.present
        record.marked_at = now
        record.marked_by_id = current_user.id
        record_correction(
            session,
            madrasa_id=madrasa.id,
            record=record,
            old_values=old_values,
            new_values=_record_snapshot(record),
            actor_id=current_user.id,
            reason="teacher check-in",
        )
    await session.commit()
    return await _teacher_today_response(
        session,
        madrasa_id=madrasa.id,
        session_id=active_session.id,
        teacher=teacher,
        attendance_date=today,
    )


@router.post("/teachers/me/check-out", response_model=TeacherAttendanceTodayResponse)
async def teacher_check_out(
    current_user: User = Depends(get_current_user),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> TeacherAttendanceTodayResponse:
    active_session = await _active_session(session, madrasa.id)
    if active_session is None:
        raise HTTPException(status_code=409, detail="No active academic session")
    teacher = await _current_teacher_profile_or_404(current_user, session, madrasa.id)
    now = datetime.now(UTC)
    today = now.date()
    record = (
        await session.execute(
            select(TeacherAttendance).where(
                TeacherAttendance.madrasa_id == madrasa.id,
                TeacherAttendance.session_id == active_session.id,
                TeacherAttendance.teacher_id == teacher.id,
                TeacherAttendance.attendance_date == today,
            )
        )
    ).scalar_one_or_none()
    if record is None or record.check_in is None:
        raise HTTPException(status_code=409, detail="Check in before checking out")
    if record.check_out is None:
        old_values = _record_snapshot(record)
        record.check_out = now.time().replace(tzinfo=None, microsecond=0)
        record.status = AttendanceStatus.present
        record.marked_at = now
        record.marked_by_id = current_user.id
        record_correction(
            session,
            madrasa_id=madrasa.id,
            record=record,
            old_values=old_values,
            new_values=_record_snapshot(record),
            actor_id=current_user.id,
            reason="teacher check-out",
        )
    await session.commit()
    return await _teacher_today_response(
        session,
        madrasa_id=madrasa.id,
        session_id=active_session.id,
        teacher=teacher,
        attendance_date=today,
    )


@router.get("/teachers/history", response_model=list[TeacherAttendanceLogEntry])
async def teacher_attendance_history(
    response: Response,
    teacher_id: UUID | None = Query(default=None),
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    limit: int = Query(default=DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
    current_user: User = Depends(get_current_user),
    madrasa: Madrasa = Depends(get_current_madrasa),
    context_session: AcademicSession = Depends(get_context_session),
    session: AsyncSession = Depends(get_session),
) -> list[TeacherAttendanceLogEntry]:
    can_manage = await user_has_permission(current_user, "teachers.attendance.manage", session)
    if not can_manage:
        own_teacher_id = await _current_teacher_id(current_user, session, madrasa.id)
        if own_teacher_id is None:
            raise HTTPException(status_code=403, detail="Missing permission: teachers.attendance.manage")
        if teacher_id is not None and teacher_id != own_teacher_id:
            raise HTTPException(status_code=403, detail="Teacher attendance access is limited to your own logs")
        teacher_id = own_teacher_id

    return await _teacher_history_entries(
        session,
        madrasa_id=madrasa.id,
        session_id=context_session.id,
        teacher_id=teacher_id,
        start_date=start_date,
        end_date=end_date,
        limit=limit,
        offset=offset,
        response=response,
    )


@router.get("/teachers/me/history", response_model=list[TeacherAttendanceLogEntry])
async def my_teacher_attendance_history(
    response: Response,
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    limit: int = Query(default=DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
    current_user: User = Depends(get_current_user),
    madrasa: Madrasa = Depends(get_current_madrasa),
    context_session: AcademicSession = Depends(get_context_session),
    session: AsyncSession = Depends(get_session),
) -> list[TeacherAttendanceLogEntry]:
    teacher_id = await _current_teacher_id(current_user, session, madrasa.id)
    if teacher_id is None:
        raise HTTPException(status_code=403, detail=ErrorCode.TEACHER_SELF_ATTENDANCE_ONLY)
    return await _teacher_history_entries(
        session,
        madrasa_id=madrasa.id,
        session_id=context_session.id,
        teacher_id=teacher_id,
        start_date=start_date,
        end_date=end_date,
        limit=limit,
        offset=offset,
        response=response,
    )


@router.post("/sync", response_model=AttendanceSyncResponse)
async def sync_attendance(
    payload: AttendanceSyncRequest,
    current_user: User = Depends(get_current_user),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session)
) -> AttendanceSyncResponse:
    accepted = 0
    corrected = 0
    locked_keys: list[str] = []
    idempotency_keys = []

    for entry in payload.entries:
        await _assert_can_mark_entry(current_user, session, madrasa.id, entry)
        if entry.subject_type == "student" and await _student_has_approved_leave(
            session,
            madrasa_id=madrasa.id,
            student_id=entry.subject_id,
            attendance_date=entry.attendance_date,
        ):
            locked_keys.append(entry.idempotency_key)
            continue
        model = StudentAttendance if entry.subject_type == "student" else TeacherAttendance
        subject_col = model.student_id if entry.subject_type == "student" else model.teacher_id

        existing = (
            await session.execute(select(model).where(model.idempotency_key == entry.idempotency_key))
        ).scalar_one_or_none()
        if existing is None:
            identity = [
                subject_col == entry.subject_id,
                model.session_id == entry.session_id,
                model.attendance_date == entry.attendance_date,
            ]
            if entry.subject_type == "student":
                # Period records correct only the same scheduled period. A
                # null slot remains the backwards-compatible general day.
                identity.append(StudentAttendance.timetable_slot_id == entry.timetable_slot_id)
            existing = (await session.execute(select(model).where(*identity))).scalar_one_or_none()

        if existing is not None:
            if not _entry_changes_record(existing, entry):
                # Pure resend — acknowledge so the client clears its outbox.
                idempotency_keys.append(entry.idempotency_key)
                continue
            if is_locked(existing.attendance_date):
                locked_keys.append(entry.idempotency_key)
                continue
            old_values = _record_snapshot(existing)
            apply_entry(existing, entry, current_user.id)
            record_correction(
                session,
                madrasa_id=madrasa.id,
                record=existing,
                old_values=old_values,
                new_values=_record_snapshot(existing),
                actor_id=current_user.id,
                reason="same-day re-mark via sync",
            )
            corrected += 1
            idempotency_keys.append(entry.idempotency_key)
            continue

        if is_locked(entry.attendance_date):
            # Day is locked — reject the write, caller must go through /override.
            locked_keys.append(entry.idempotency_key)
            continue

        record = build_record(entry, madrasa.id, current_user.id, overridden=False)
        session.add(record)
        accepted += 1
        idempotency_keys.append(entry.idempotency_key)

    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(status_code=409, detail="Idempotency key collision or invalid reference")

    return AttendanceSyncResponse(
        accepted=accepted,
        synced_late=0,
        corrected=corrected,
        idempotency_keys=idempotency_keys,
        locked=locked_keys,
    )


@router.post("/override", response_model=AttendanceOverrideResponse)
async def override_locked_attendance(
    payload: AttendanceOverrideRequest,
    current_user: User = Depends(require_permission("attendance.edit_locked")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> AttendanceOverrideResponse:
    entry = payload.entry
    await _assert_can_mark_entry(current_user, session, madrasa.id, entry)
    if entry.subject_type == "student" and await _student_has_approved_leave(
        session,
        madrasa_id=madrasa.id,
        student_id=entry.subject_id,
        attendance_date=entry.attendance_date,
    ):
        raise HTTPException(status_code=409, detail="Approved leave is locked until the leave status is rejected")
    model = StudentAttendance if entry.subject_type == "student" else TeacherAttendance
    subject_col = model.student_id if entry.subject_type == "student" else model.teacher_id

    stmt = select(model).where(model.idempotency_key == entry.idempotency_key)
    existing = (await session.execute(stmt)).scalar_one_or_none()
    if existing is None:
        identity = [
            subject_col == entry.subject_id,
            model.session_id == entry.session_id,
            model.attendance_date == entry.attendance_date,
        ]
        if entry.subject_type == "student":
            identity.append(StudentAttendance.timetable_slot_id == entry.timetable_slot_id)
        existing = (await session.execute(select(model).where(*identity))).scalar_one_or_none()

    if existing:
        old_values = {"status": str(existing.status.value), "attendance_date": str(existing.attendance_date)}
        correction_old = _record_snapshot(existing)
        apply_entry(existing, entry, current_user.id)
        existing.synced_late = True
        existing.overridden = True
        record_correction(
            session,
            madrasa_id=madrasa.id,
            record=existing,
            old_values=correction_old,
            new_values=_record_snapshot(existing),
            actor_id=current_user.id,
            reason=payload.reason,
        )
        new_values = {"status": str(entry.status.value), "attendance_date": str(entry.attendance_date)}
        entity_id = str(existing.id)
    else:
        record = build_record(entry, madrasa.id, current_user.id, overridden=True)
        session.add(record)
        old_values = {}
        new_values = {"status": str(entry.status.value), "attendance_date": str(entry.attendance_date)}
        await session.flush()
        entity_id = str(record.id)

    record_audit(
        session,
        madrasa_id=madrasa.id,
        actor_id=current_user.id,
        action="attendance.override",
        entity_name=entry.subject_type + "_attendance",
        entity_id=entity_id,
        old_values=old_values,
        new_values={**new_values, "reason": payload.reason},
    )

    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(status_code=409, detail="Idempotency key collision or invalid reference")

    return AttendanceOverrideResponse(idempotency_key=entry.idempotency_key, subject_id=entry.subject_id)


@router.get("/summary/{subject_type}/{subject_id}", response_model=AttendanceSummary)
async def attendance_summary(
    subject_type: str,
    subject_id: UUID,
    start_date: date = Query(...),
    end_date: date = Query(...),
    course_id: UUID | None = None,
    current_user: User = Depends(require_permission("attendance.take")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> AttendanceSummary:
    return await compute_attendance_summary(
        session, madrasa.id, subject_type, subject_id, start_date, end_date, course_id=course_id
    )


async def compute_attendance_summary(
    session: AsyncSession,
    madrasa_id: UUID,
    subject_type: str,
    subject_id: UUID,
    start_date: date,
    end_date: date,
    *,
    course_id: UUID | None = None,
    class_id: UUID | None = None,
    section_id: UUID | None = None,
) -> AttendanceSummary:
    if subject_type not in ("student", "teacher"):
        raise HTTPException(status_code=400, detail="subject_type must be student or teacher")
    model = StudentAttendance if subject_type == "student" else TeacherAttendance
    subject_col = model.student_id if subject_type == "student" else model.teacher_id

    if subject_type == "teacher" and course_id is not None:
        raise HTTPException(status_code=400, detail="course_id is only valid for student attendance")
    attendance_stmt = select(model.attendance_date, model.status).where(
        model.madrasa_id == madrasa_id,
        subject_col == subject_id,
        model.attendance_date >= start_date,
        model.attendance_date <= end_date,
    )
    if course_id is not None:
        course = await session.get(Course, course_id)
        if course is None or course.madrasa_id != madrasa_id:
            raise HTTPException(status_code=404, detail="Course not found")
        attendance_stmt = attendance_stmt.where(StudentAttendance.course_id == course_id)
    if subject_type == "student" and class_id is not None:
        attendance_stmt = attendance_stmt.join(
            Enrollment,
            and_(
                Enrollment.madrasa_id == madrasa_id,
                Enrollment.student_id == StudentAttendance.student_id,
                Enrollment.session_id == StudentAttendance.session_id,
                Enrollment.started_on <= StudentAttendance.attendance_date,
                or_(
                    Enrollment.ended_on.is_(None),
                    Enrollment.ended_on >= StudentAttendance.attendance_date,
                ),
            ),
        ).where(Enrollment.class_id == class_id)
        if section_id is not None:
            attendance_stmt = attendance_stmt.where(Enrollment.section_id == section_id)
    rows = (await session.execute(attendance_stmt)).all()
    by_date: defaultdict[date, list[AttendanceStatus]] = defaultdict(list)
    for attendance_day, attendance_status in rows:
        by_date[attendance_day].append(attendance_status)

    if subject_type == "student":
        subject_user_id = (
            await session.execute(
                select(StudentProfile.user_id).where(
                    StudentProfile.madrasa_id == madrasa_id,
                    StudentProfile.id == subject_id,
                )
            )
        ).scalar_one_or_none()
    else:
        subject_user_id = (
            await session.execute(
                select(TeacherProfile.user_id).where(
                    TeacherProfile.madrasa_id == madrasa_id,
                    TeacherProfile.id == subject_id,
                )
            )
        ).scalar_one_or_none()

    if subject_user_id is None:
        raise HTTPException(status_code=404, detail=f"{subject_type.capitalize()} not found")

    # Class-scoped holidays (B4-c) only count for students of those classes;
    # teachers and madrasa-wide holidays always count.
    subject_class_id = class_id
    if subject_type == "student" and subject_class_id is None:
        subject_class_id = (
            await session.execute(
                select(Enrollment.class_id)
                .join(AcademicSession, AcademicSession.id == Enrollment.session_id)
                .where(
                    Enrollment.student_id == subject_id,
                    Enrollment.ended_on.is_(None),
                    AcademicSession.is_active.is_(True),
                )
            )
        ).scalar_one_or_none()

    holiday_rows = (
        await session.execute(
            select(Holiday.start_date, Holiday.end_date, Holiday.class_ids).where(
                Holiday.madrasa_id == madrasa_id,
                Holiday.start_date <= end_date,
                Holiday.end_date >= start_date,
            )
        )
    ).all()
    holidays = [
        (h_start, h_end)
        for h_start, h_end, h_class_ids in holiday_rows
        if not h_class_ids
        or (subject_class_id is not None and str(subject_class_id) in h_class_ids)
    ]

    approved_leave = []
    if subject_user_id is not None:
        approved_leave = (
            await session.execute(
                select(Leave.start_date, Leave.end_date).where(
                    Leave.madrasa_id == madrasa_id,
                    Leave.user_id == subject_user_id,
                    Leave.status == "approved",
                    Leave.start_date <= end_date,
                    Leave.end_date >= start_date,
                )
            )
        ).all()

    def is_holiday(day: date) -> bool:
        for h_start, h_end in holidays:
            if h_start <= day <= h_end:
                return True
        return False

    def has_approved_leave(day: date) -> bool:
        for l_start, l_end in approved_leave:
            if l_start <= day <= l_end:
                return True
        return False

    counts = {"present": 0, "absent": 0, "leave": 0}
    excluded_days = 0
    days: list[AttendanceDayBreakdown] = []
    current = start_date
    while current <= end_date:
        status_values = by_date.get(current, [])
        if is_holiday(current):
            excluded_days += 1
            days.append(AttendanceDayBreakdown(attendance_date=current, excluded_reason="holiday"))
        elif has_approved_leave(current):
            counts["leave"] += 1
            days.append(AttendanceDayBreakdown(attendance_date=current, status=AttendanceStatus.leave))
        elif status_values:
            for status_value in status_values:
                counts[str(status_value.value if isinstance(status_value, AttendanceStatus) else status_value)] += 1
                days.append(AttendanceDayBreakdown(attendance_date=current, status=status_value))
        current = date.fromordinal(current.toordinal() + 1)

    return AttendanceSummary(
        subject_id=subject_id,
        subject_type=subject_type,
        course_id=course_id,
        present=counts["present"],
        absent=counts["absent"],
        leave=counts["leave"],
        excluded_days=excluded_days,
        days=days,
    )
