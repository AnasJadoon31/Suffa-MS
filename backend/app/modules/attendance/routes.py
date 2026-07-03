from datetime import UTC, datetime, time

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError

from app.core.tenancy import TenantContext, get_tenant
from app.core.dependencies import get_current_user, get_current_madrasa
from app.db.base import get_session
from app.modules.auth.models import User
from app.modules.academics.models import Madrasa
from app.modules.attendance.models import StudentAttendance, TeacherAttendance
from app.modules.attendance.schemas import AttendanceSyncRequest, AttendanceSyncResponse

router = APIRouter()

def is_synced_late(captured_at: datetime) -> bool:
    local_cutoff = datetime.combine(captured_at.date(), time(23, 59), tzinfo=captured_at.tzinfo or UTC)
    return datetime.now(captured_at.tzinfo or UTC) > local_cutoff


@router.post("/sync", response_model=AttendanceSyncResponse)
async def sync_attendance(
    payload: AttendanceSyncRequest,
    current_user: User = Depends(get_current_user),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session)
) -> AttendanceSyncResponse:
    accepted = 0
    synced_late_count = 0
    idempotency_keys = []

    for entry in payload.entries:
        is_late = is_synced_late(entry.captured_at)
        
        # Determine table model
        model = StudentAttendance if entry.subject_type == "student" else TeacherAttendance
        
        # Check idempotency
        stmt = select(model).where(model.idempotency_key == entry.idempotency_key)
        result = await session.execute(stmt)
        if result.scalar_one_or_none():
            continue  # Already processed this key

        if entry.subject_type == "student":
            record = StudentAttendance(
                madrasa_id=madrasa.id,
                student_id=entry.subject_id,
                session_id=entry.session_id,
                attendance_date=entry.attendance_date,
                status=entry.status,
                marked_at=entry.captured_at,
                marked_by_id=current_user.id,
                idempotency_key=entry.idempotency_key,
                synced_late=is_late
            )
        else:
            record = TeacherAttendance(
                madrasa_id=madrasa.id,
                teacher_id=entry.subject_id,
                session_id=entry.session_id,
                attendance_date=entry.attendance_date,
                status=entry.status,
                marked_at=entry.captured_at,
                marked_by_id=current_user.id,
                idempotency_key=entry.idempotency_key,
                synced_late=is_late
            )

        session.add(record)
        accepted += 1
        if is_late:
            synced_late_count += 1
        idempotency_keys.append(entry.idempotency_key)

    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(status_code=409, detail="Idempotency key collision or invalid reference")

    return AttendanceSyncResponse(
        accepted=accepted,
        synced_late=synced_late_count,
        idempotency_keys=idempotency_keys,
    )
