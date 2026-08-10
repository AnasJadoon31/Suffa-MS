import json
import os
from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

from arq import cron
from arq.connections import RedisSettings
from sqlalchemy import select

from app.db.session import SessionLocal
from app.modules.academics.models import AcademicSession
from app.modules.attendance.models import AttendanceStatus, TeacherAttendance
from app.modules.auth.models import User, UserRole, UserStatus
from app.modules.operations.models import Holiday, Leave, MadrasaSetting
from app.modules.people.models import TeacherProfile


PAKISTAN_TIMEZONE = ZoneInfo("Asia/Karachi")
DEFAULT_SCHOOL_DAY_INDEXES = frozenset({0, 1, 2, 3, 4, 5})


async def _school_day_indexes(session, madrasa_id) -> frozenset[int]:
    value = (
        await session.execute(
            select(MadrasaSetting.value).where(
                MadrasaSetting.madrasa_id == madrasa_id,
                MadrasaSetting.key == "attendance.school_days",
            )
        )
    ).scalar_one_or_none()
    if not value:
        return DEFAULT_SCHOOL_DAY_INDEXES
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError:
        return DEFAULT_SCHOOL_DAY_INDEXES
    days = {item for item in parsed if isinstance(item, int) and 0 <= item <= 6} if isinstance(parsed, list) else set()
    return frozenset(days) if days else DEFAULT_SCHOOL_DAY_INDEXES


async def mark_missing_teacher_checkins_for_date(target_date: date) -> int:
    """Create one absent record for each eligible teacher who never checked in."""
    created = 0
    async with SessionLocal() as session:
        active_sessions = (
            await session.execute(select(AcademicSession).where(AcademicSession.is_active.is_(True)))
        ).scalars().all()

        for academic_session in active_sessions:
            madrasa_id = academic_session.madrasa_id
            if target_date.weekday() not in await _school_day_indexes(session, madrasa_id):
                continue

            holiday_class_scopes = (
                await session.execute(
                    select(Holiday.class_ids).where(
                        Holiday.madrasa_id == madrasa_id,
                        Holiday.start_date <= target_date,
                        Holiday.end_date >= target_date,
                    )
                )
            ).scalars().all()
            holiday_exists = any(not class_ids for class_ids in holiday_class_scopes)
            if holiday_exists:
                continue

            actor_id = (
                await session.execute(
                    select(User.id).where(
                        User.madrasa_id == madrasa_id,
                        User.status == UserStatus.active,
                        User.role == UserRole.principal,
                    ).limit(1)
                )
            ).scalar_one_or_none()
            if actor_id is None:
                actor_id = (
                    await session.execute(
                        select(User.id).where(
                            User.madrasa_id == madrasa_id,
                            User.status == UserStatus.active,
                        ).limit(1)
                    )
                ).scalar_one_or_none()
            if actor_id is None:
                continue

            teachers = (
                await session.execute(
                    select(TeacherProfile.id, TeacherProfile.user_id).where(
                        TeacherProfile.madrasa_id == madrasa_id,
                        TeacherProfile.status == "active",
                        TeacherProfile.user_id.in_(
                            select(User.id).where(User.status == UserStatus.active)
                        ),
                    )
                )
            ).all()
            existing_teacher_ids = set(
                (
                    await session.execute(
                        select(TeacherAttendance.teacher_id).where(
                            TeacherAttendance.madrasa_id == madrasa_id,
                            TeacherAttendance.session_id == academic_session.id,
                            TeacherAttendance.attendance_date == target_date,
                        )
                    )
                ).scalars().all()
            )
            approved_leave_user_ids = set(
                (
                    await session.execute(
                        select(Leave.user_id).where(
                            Leave.madrasa_id == madrasa_id,
                            Leave.status == "approved",
                            Leave.start_date <= target_date,
                            Leave.end_date >= target_date,
                        )
                    )
                ).scalars().all()
            )

            for teacher_id, user_id in teachers:
                if teacher_id in existing_teacher_ids or user_id in approved_leave_user_ids:
                    continue
                session.add(
                    TeacherAttendance(
                        madrasa_id=madrasa_id,
                        teacher_id=teacher_id,
                        session_id=academic_session.id,
                        attendance_date=target_date,
                        status=AttendanceStatus.absent,
                        marked_at=datetime.now(UTC),
                        marked_by_id=actor_id,
                        idempotency_key=f"automatic-absence:{teacher_id}:{academic_session.id}:{target_date.isoformat()}",
                    )
                )
                created += 1

        await session.commit()
    return created


async def mark_missing_teacher_checkins(ctx):
    """Run after midnight so the prior school day is complete before marking absences."""
    target_date = datetime.now(PAKISTAN_TIMEZONE).date() - timedelta(days=1)
    return await mark_missing_teacher_checkins_for_date(target_date)


async def noop(ctx):
    """Placeholder task so the ARQ worker can idle until real jobs are added."""
    return None


class WorkerSettings:
    functions = [noop, mark_missing_teacher_checkins]
    cron_jobs = [cron(mark_missing_teacher_checkins, hour=0, minute=5, run_at_startup=True)]
    timezone = PAKISTAN_TIMEZONE
    redis_settings = RedisSettings.from_dsn(os.getenv("REDIS_URL", "redis://localhost:6379/0"))
