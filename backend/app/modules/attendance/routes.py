import json
from collections import defaultdict
from datetime import UTC, date, datetime, time
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError

from app.core.audit import record_audit
from app.core.dependencies import get_current_madrasa, get_current_user, require_permission, user_has_permission
from app.db.session import get_session
from app.modules.auth.models import User, UserRole
from app.modules.academics.models import AcademicClass, AcademicSession, Course, Enrollment, Madrasa, Section, TeacherAssignment
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
from app.modules.operations.models import Holiday, Leave
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
        return StudentAttendance(student_id=entry.subject_id, **common)
    return TeacherAttendance(
        teacher_id=entry.subject_id,
        check_in=entry.check_in,
        check_out=entry.check_out,
        **common,
    )


async def _require_student_attendance_access(current_user: User, session: AsyncSession) -> None:
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
    result = await session.execute(
        select(TeacherAssignment.class_id).where(
            TeacherAssignment.madrasa_id == madrasa_id,
            TeacherAssignment.teacher_id == teacher_id,
            TeacherAssignment.session_id == session_id,
        )
    )
    return set(result.scalars().all())


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

    if await _has_global_student_attendance_access(current_user, session):
        return

    class_id = (
        await session.execute(
            select(Enrollment.class_id).where(
                Enrollment.madrasa_id == madrasa_id,
                Enrollment.student_id == entry.subject_id,
                Enrollment.session_id == entry.session_id,
            )
        )
    ).scalar_one_or_none()
    if class_id is None:
        raise HTTPException(status_code=403, detail="Student is not enrolled in this session")
    await _assert_can_mark_class(current_user, session, madrasa_id, entry.session_id, class_id)


@router.get("/classes", response_model=list[AttendanceClassRead])
async def attendance_classes(
    current_user: User = Depends(get_current_user),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> list[AttendanceClassRead]:
    await _require_student_attendance_access(current_user, session)
    active_session = await _active_session(session, madrasa.id)
    if active_session is None:
        return []

    is_global = await _has_global_student_attendance_access(current_user, session)
    assigned_course_ids: set[UUID] = set()
    class_stmt = select(AcademicClass.id, AcademicClass.name).where(AcademicClass.madrasa_id == madrasa.id)

    if not is_global:
        teacher_id = await _current_teacher_id(current_user, session, madrasa.id)
        if teacher_id is None:
            return []
        assignments = (
            await session.execute(
                select(TeacherAssignment.class_id, TeacherAssignment.course_id).where(
                    TeacherAssignment.madrasa_id == madrasa.id,
                    TeacherAssignment.teacher_id == teacher_id,
                    TeacherAssignment.session_id == active_session.id,
                )
            )
        ).all()
        assigned_class_ids = {row[0] for row in assignments}
        assigned_course_ids = {row[1] for row in assignments}
        if not assigned_class_ids:
            return []
        class_stmt = class_stmt.where(AcademicClass.id.in_(assigned_class_ids))

    class_rows = (await session.execute(class_stmt.order_by(AcademicClass.name))).all()
    class_ids = [row[0] for row in class_rows]
    if not class_ids:
        return []

    count_rows = (
        await session.execute(
            select(Enrollment.class_id, func.count(StudentProfile.id))
            .join(StudentProfile, StudentProfile.id == Enrollment.student_id)
            .where(
                Enrollment.madrasa_id == madrasa.id,
                Enrollment.session_id == active_session.id,
                Enrollment.class_id.in_(class_ids),
                StudentProfile.status == "active",
            )
            .group_by(Enrollment.class_id)
        )
    ).all()
    student_counts = {row[0]: row[1] for row in count_rows}

    course_stmt = select(Course.class_id, Course.name).where(
        Course.madrasa_id == madrasa.id,
        Course.class_id.in_(class_ids),
    )
    if assigned_course_ids:
        course_stmt = course_stmt.where(Course.id.in_(assigned_course_ids))
    course_rows = (await session.execute(course_stmt.order_by(Course.name))).all()
    course_names: defaultdict[UUID, list[str]] = defaultdict(list)
    for class_id, course_name in course_rows:
        course_names[class_id].append(course_name)

    return [
        AttendanceClassRead(
            id=class_id,
            name=class_name,
            course_names=course_names[class_id],
            student_count=student_counts.get(class_id, 0),
        )
        for class_id, class_name in class_rows
    ]


@router.get("/classes/{class_id}/roster", response_model=AttendanceRosterResponse)
async def attendance_class_roster(
    class_id: UUID,
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

    await _assert_can_mark_class(current_user, session, madrasa.id, active_session.id, class_id)

    rows = (
        await session.execute(
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
                StudentProfile.status == "active",
            )
            .order_by(Section.name, StudentProfile.name)
        )
    ).all()

    return AttendanceRosterResponse(
        session_id=active_session.id,
        session_name=active_session.name,
        class_id=academic_class.id,
        class_name=academic_class.name,
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
    )


def _teacher_history_entry_from_row(row) -> TeacherAttendanceLogEntry:
    (
        attendance_id,
        teacher_id,
        teacher_name,
        employee_code,
        attendance_date,
        status,
        check_in,
        check_out,
        marked_at,
        created_at,
        updated_at,
        marker_id,
        marker_username,
        marker_role,
        marker_display_name,
        overridden,
    ) = row
    synced_at = updated_at or created_at
    return TeacherAttendanceLogEntry(
        id=attendance_id,
        teacher_id=teacher_id,
        teacher_name=teacher_name,
        employee_code=employee_code,
        attendance_date=attendance_date,
        status=status,
        check_in=check_in,
        check_out=check_out,
        marked_at=marked_at,
        synced_at=synced_at,
        marked_by=AttendanceMarkerRead(
            id=marker_id,
            username=marker_username,
            display_name=marker_display_name or marker_username,
            role=str(marker_role.value if hasattr(marker_role, "value") else marker_role),
        ),
        overridden=overridden,
    )


async def _teacher_history_entries(
    session: AsyncSession,
    *,
    madrasa_id: UUID,
    session_id: UUID,
    teacher_id: UUID | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
) -> list[TeacherAttendanceLogEntry]:
    marker_teacher = TeacherProfile.__table__.alias("marker_teacher")
    stmt = (
        select(
            TeacherAttendance.id,
            TeacherProfile.id,
            TeacherProfile.name,
            TeacherProfile.employee_code,
            TeacherAttendance.attendance_date,
            TeacherAttendance.status,
            TeacherAttendance.check_in,
            TeacherAttendance.check_out,
            TeacherAttendance.marked_at,
            TeacherAttendance.created_at,
            TeacherAttendance.updated_at,
            User.id,
            User.username,
            User.role,
            marker_teacher.c.name,
            TeacherAttendance.overridden,
        )
        .select_from(TeacherAttendance)
        .join(TeacherProfile, TeacherProfile.id == TeacherAttendance.teacher_id)
        .join(User, User.id == TeacherAttendance.marked_by_id)
        .outerjoin(marker_teacher, marker_teacher.c.user_id == User.id)
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
    rows = (
        await session.execute(
            stmt.order_by(TeacherAttendance.attendance_date.desc(), TeacherProfile.name)
        )
    ).all()
    return [_teacher_history_entry_from_row(row) for row in rows]


async def _class_history_entries(
    session: AsyncSession,
    *,
    madrasa_id: UUID,
    session_id: UUID,
    class_id: UUID,
    student_id: UUID | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
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
        .where(
            StudentAttendance.madrasa_id == madrasa_id,
            StudentAttendance.session_id == session_id,
            Enrollment.class_id == class_id,
        )
    )
    if student_id is not None:
        stmt = stmt.where(StudentAttendance.student_id == student_id)
    if start_date is not None:
        stmt = stmt.where(StudentAttendance.attendance_date >= start_date)
    if end_date is not None:
        stmt = stmt.where(StudentAttendance.attendance_date <= end_date)
    rows = (
        await session.execute(
            stmt.order_by(StudentAttendance.attendance_date.desc(), StudentProfile.name)
        )
    ).all()
    return [_history_entry_from_row(row) for row in rows]


@router.get("/classes/{class_id}/history", response_model=ClassAttendanceHistoryResponse)
async def attendance_class_history(
    class_id: UUID,
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
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

    await _assert_can_mark_class(current_user, session, madrasa.id, active_session.id, class_id)

    entries = await _class_history_entries(
        session,
        madrasa_id=madrasa.id,
        session_id=active_session.id,
        class_id=class_id,
        start_date=start_date,
        end_date=end_date,
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
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
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

    await _assert_can_mark_class(current_user, session, madrasa.id, active_session.id, class_id)

    student_row = (
        await session.execute(
            select(StudentProfile.id, StudentProfile.admission_number, StudentProfile.name, Section.id, Section.name)
            .join(Enrollment, Enrollment.student_id == StudentProfile.id)
            .outerjoin(Section, Section.id == Enrollment.section_id)
            .where(
                Enrollment.madrasa_id == madrasa.id,
                Enrollment.session_id == active_session.id,
                Enrollment.class_id == class_id,
                StudentProfile.id == student_id,
                StudentProfile.status == "active",
            )
        )
    ).first()
    if student_row is None:
        raise HTTPException(status_code=404, detail="Student not found in this class")

    entries = await _class_history_entries(
        session,
        madrasa_id=madrasa.id,
        session_id=active_session.id,
        class_id=class_id,
        student_id=student_id,
        start_date=start_date,
        end_date=end_date,
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
    teacher_id: UUID | None = Query(default=None),
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    current_user: User = Depends(get_current_user),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> list[TeacherAttendanceLogEntry]:
    active_session = await _active_session(session, madrasa.id)
    if active_session is None:
        return []

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
        session_id=active_session.id,
        teacher_id=teacher_id,
        start_date=start_date,
        end_date=end_date,
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
        model = StudentAttendance if entry.subject_type == "student" else TeacherAttendance
        subject_col = model.student_id if entry.subject_type == "student" else model.teacher_id

        existing = (
            await session.execute(select(model).where(model.idempotency_key == entry.idempotency_key))
        ).scalar_one_or_none()
        if existing is None:
            # One row per (subject, session, day) — a re-mark of the same day is a
            # correction of the existing row, never a second insert.
            existing = (
                await session.execute(
                    select(model).where(
                        subject_col == entry.subject_id,
                        model.session_id == entry.session_id,
                        model.attendance_date == entry.attendance_date,
                    )
                )
            ).scalar_one_or_none()

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
    model = StudentAttendance if entry.subject_type == "student" else TeacherAttendance
    subject_col = model.student_id if entry.subject_type == "student" else model.teacher_id

    stmt = select(model).where(model.idempotency_key == entry.idempotency_key)
    existing = (await session.execute(stmt)).scalar_one_or_none()
    if existing is None:
        existing = (
            await session.execute(
                select(model).where(
                    subject_col == entry.subject_id,
                    model.session_id == entry.session_id,
                    model.attendance_date == entry.attendance_date,
                )
            )
        ).scalar_one_or_none()

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
    current_user: User = Depends(require_permission("attendance.take")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> AttendanceSummary:
    return await compute_attendance_summary(session, madrasa.id, subject_type, subject_id, start_date, end_date)


async def compute_attendance_summary(
    session: AsyncSession, madrasa_id: UUID, subject_type: str, subject_id: UUID, start_date: date, end_date: date
) -> AttendanceSummary:
    if subject_type not in ("student", "teacher"):
        raise HTTPException(status_code=400, detail="subject_type must be student or teacher")
    model = StudentAttendance if subject_type == "student" else TeacherAttendance
    subject_col = model.student_id if subject_type == "student" else model.teacher_id

    rows = (
        await session.execute(
            select(model.attendance_date, model.status).where(
                model.madrasa_id == madrasa_id,
                subject_col == subject_id,
                model.attendance_date >= start_date,
                model.attendance_date <= end_date,
            )
        )
    ).all()
    by_date = {row[0]: row[1] for row in rows}

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

    holidays = (
        await session.execute(
            select(Holiday.start_date, Holiday.end_date).where(
                Holiday.madrasa_id == madrasa_id,
                Holiday.start_date <= end_date,
                Holiday.end_date >= start_date,
            )
        )
    ).all()

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

    def excluded_reason(day: date) -> str | None:
        for h_start, h_end in holidays:
            if h_start <= day <= h_end:
                return "holiday"
        for l_start, l_end in approved_leave:
            if l_start <= day <= l_end:
                return "leave"
        return None

    counts = {"present": 0, "absent": 0, "leave": 0}
    excluded_days = 0
    days: list[AttendanceDayBreakdown] = []
    current = start_date
    while current <= end_date:
        reason = excluded_reason(current)
        status_value = by_date.get(current)
        if reason:
            excluded_days += 1
            days.append(AttendanceDayBreakdown(attendance_date=current, excluded_reason=reason))
        elif status_value is not None:
            counts[str(status_value.value if isinstance(status_value, AttendanceStatus) else status_value)] += 1
            days.append(AttendanceDayBreakdown(attendance_date=current, status=status_value))
        current = date.fromordinal(current.toordinal() + 1)

    return AttendanceSummary(
        subject_id=subject_id,
        subject_type=subject_type,
        present=counts["present"],
        absent=counts["absent"],
        leave=counts["leave"],
        excluded_days=excluded_days,
        days=days,
    )
