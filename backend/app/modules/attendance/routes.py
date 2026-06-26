from datetime import UTC, datetime, time

from fastapi import APIRouter, Depends

from app.core.tenancy import TenantContext, get_tenant
from app.modules.attendance.schemas import AttendanceSyncRequest, AttendanceSyncResponse

router = APIRouter()


def is_synced_late(captured_at: datetime) -> bool:
    local_cutoff = datetime.combine(captured_at.date(), time(23, 59), tzinfo=captured_at.tzinfo or UTC)
    return datetime.now(captured_at.tzinfo or UTC) > local_cutoff


@router.post("/sync", response_model=AttendanceSyncResponse)
async def sync_attendance(
    payload: AttendanceSyncRequest,
    tenant: TenantContext = Depends(get_tenant),
) -> AttendanceSyncResponse:
    late = sum(1 for entry in payload.entries if is_synced_late(entry.captured_at))
    return AttendanceSyncResponse(
        accepted=len(payload.entries),
        synced_late=late,
        idempotency_keys=[entry.idempotency_key for entry in payload.entries],
    )


@router.get("/missing")
async def missing_attendance(days: int = 2) -> dict[str, object]:
    return {
        "window_days": days,
        "teachers": [
            {"id": "tch-1", "name": "Maulana Yusuf", "last_sync": "2026-06-23"},
        ],
    }


@router.get("/summary")
async def summary() -> dict[str, object]:
    return {"present": 42, "absent": 3, "leave": 1, "synced_late": 0}
