from datetime import UTC, date, datetime, time
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError

from app.core.audit import record_audit
from app.core.dependencies import get_current_madrasa, require_permission
from app.db.session import get_session
from app.modules.auth.models import User
from app.modules.academics.models import Madrasa
from app.modules.attendance.models import StudentAttendance, TeacherAttendance
from app.modules.attendance.schemas import (
    AttendanceEntry,
    AttendanceOverrideRequest,
    AttendanceOverrideResponse,
    AttendanceStatus,
    AttendanceSummary,
    AttendanceDayBreakdown,
    AttendanceSyncRequest,
    AttendanceSyncResponse,
)
from app.modules.operations.models import Holiday, Leave

router = APIRouter()


def lock_cutoff(attendance_date: date) -> datetime:
    return datetime.combine(attendance_date, time(23, 59), tzinfo=UTC)


def is_locked(attendance_date: date, now: datetime | None = None) -> bool:
    return (now or datetime.now(UTC)) > lock_cutoff(attendance_date)


# kept for backwards compatibility with any existing callers/tests
def is_synced_late(captured_at: datetime) -> bool:
    return is_locked(captured_at.date(), captured_at)


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


@router.post("/sync", response_model=AttendanceSyncResponse)
async def sync_attendance(
    payload: AttendanceSyncRequest,
    current_user: User = Depends(require_permission("attendance.take")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session)
) -> AttendanceSyncResponse:
    accepted = 0
    locked_keys: list[str] = []
    idempotency_keys = []

    for entry in payload.entries:
        model = StudentAttendance if entry.subject_type == "student" else TeacherAttendance

        stmt = select(model).where(model.idempotency_key == entry.idempotency_key)
        result = await session.execute(stmt)
        if result.scalar_one_or_none():
            continue  # Already processed this key

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
    model = StudentAttendance if entry.subject_type == "student" else TeacherAttendance

    stmt = select(model).where(model.idempotency_key == entry.idempotency_key)
    existing = (await session.execute(stmt)).scalar_one_or_none()

    if existing:
        old_values = {"status": str(existing.status.value), "attendance_date": str(existing.attendance_date)}
        existing.status = entry.status
        existing.marked_at = entry.captured_at
        existing.marked_by_id = current_user.id
        existing.synced_late = True
        existing.overridden = True
        if isinstance(existing, TeacherAttendance):
            existing.check_in = entry.check_in
            existing.check_out = entry.check_out
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

    holidays = (
        await session.execute(
            select(Holiday.start_date, Holiday.end_date).where(
                Holiday.madrasa_id == madrasa_id,
                Holiday.start_date <= end_date,
                Holiday.end_date >= start_date,
            )
        )
    ).all()

    approved_leave = (
        await session.execute(
            select(Leave.start_date, Leave.end_date).where(
                Leave.madrasa_id == madrasa_id,
                Leave.user_id == subject_id,
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
        if reason and status_value is None:
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
