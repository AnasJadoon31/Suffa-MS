from fastapi import APIRouter

router = APIRouter()


@router.get("/dashboard")
async def dashboard() -> dict[str, object]:
    return {
        "counts": {"students": 128, "teachers": 12, "classes": 8},
        "attendance": {"present": 42, "absent": 3, "leave": 1, "missing_sync_teachers": 1},
        "finance": {"month_total": 184500, "currency": "PKR"},
        "activity": [
            "Attendance synced for Darja 1",
            "New admission application received",
            "Result card generated for ADM-0001",
        ],
    }
