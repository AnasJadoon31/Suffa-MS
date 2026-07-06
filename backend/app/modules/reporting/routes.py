from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_madrasa, get_current_user
from app.db.core_models import AuditLog
from app.db.session import get_session
from app.modules.academics.models import AcademicClass, Madrasa
from app.modules.attendance.models import AttendanceStatus, StudentAttendance, TeacherAttendance
from app.modules.auth.models import User
from app.modules.finance.models import Donation, Payment
from app.modules.people.models import StudentProfile, TeacherProfile

router = APIRouter()


@router.get("/dashboard")
async def dashboard(
    current_user: User = Depends(get_current_user),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> dict[str, object]:
    today = datetime.now(timezone.utc).date()
    month_start = today.replace(day=1)

    student_count = (
        await session.execute(
            select(func.count()).select_from(StudentProfile).where(
                StudentProfile.madrasa_id == madrasa.id, StudentProfile.status == "active"
            )
        )
    ).scalar_one()
    teacher_rows = (
        await session.execute(
            select(TeacherProfile).where(TeacherProfile.madrasa_id == madrasa.id, TeacherProfile.status == "active")
        )
    ).scalars().all()
    class_count = (
        await session.execute(select(func.count()).select_from(AcademicClass).where(AcademicClass.madrasa_id == madrasa.id))
    ).scalar_one()

    attendance_counts = {"present": 0, "absent": 0, "leave": 0}
    rows = (
        await session.execute(
            select(StudentAttendance.status, func.count())
            .where(StudentAttendance.madrasa_id == madrasa.id, StudentAttendance.attendance_date == today)
            .group_by(StudentAttendance.status)
        )
    ).all()
    for status_value, count in rows:
        attendance_counts[str(status_value.value if isinstance(status_value, AttendanceStatus) else status_value)] = count

    synced_teacher_ids = set(
        (
            await session.execute(
                select(TeacherAttendance.teacher_id).where(
                    TeacherAttendance.madrasa_id == madrasa.id, TeacherAttendance.attendance_date == today
                )
            )
        ).scalars().all()
    )
    missing_sync_teachers = len([t for t in teacher_rows if t.id not in synced_teacher_ids])

    payments = (
        await session.execute(
            select(func.coalesce(func.sum(Payment.amount), 0)).where(
                Payment.madrasa_id == madrasa.id, Payment.payment_date >= month_start
            )
        )
    ).scalar_one()
    donations = (
        await session.execute(
            select(func.coalesce(func.sum(Donation.amount), 0)).where(
                Donation.madrasa_id == madrasa.id, Donation.donation_date >= month_start
            )
        )
    ).scalar_one()

    recent_logs = (
        await session.execute(
            select(AuditLog)
            .where(AuditLog.madrasa_id == madrasa.id)
            .order_by(AuditLog.action_time.desc())
            .limit(5)
        )
    ).scalars().all()
    activity = [f"{log.action} · {log.entity_name} ({log.action_time:%Y-%m-%d %H:%M})" for log in recent_logs]

    return {
        "counts": {"students": student_count, "teachers": len(teacher_rows), "classes": class_count},
        "attendance": {**attendance_counts, "missing_sync_teachers": missing_sync_teachers},
        "finance": {"month_total": float(payments) + float(donations), "currency": "PKR"},
        "activity": activity,
    }
