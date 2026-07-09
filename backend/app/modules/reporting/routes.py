import csv
import io
from datetime import date, datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_madrasa, get_current_user, require_permission
from app.core.pdf import render_table_pdf
from app.db.core_models import AuditLog
from app.db.session import get_session
from app.modules.academics.models import AcademicClass, AcademicSession, Course, Enrollment, Madrasa, TeacherAssignment
from app.modules.assessments.models import Assignment, ResultPublication, Submission
from app.modules.assessments.routes import (
    _build_session_result,
    _student_profile,
    _teacher_profile,
)
from app.modules.attendance.models import AttendanceStatus, StudentAttendance, TeacherAttendance
from app.modules.attendance.routes import compute_attendance_summary
from app.modules.auth.models import User, UserRole
from app.modules.finance.models import Donation, Donor, Payment, PaymentCategory
from app.modules.operations.models import Announcement, Resource, TimetableSlot
from app.modules.operations.routes import _active_session_id, _visible
from app.modules.people.models import StudentProfile, TeacherProfile

router = APIRouter()


@router.get("/dashboard")
async def dashboard(
    current_user: User = Depends(get_current_user),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> dict[str, object]:
    if current_user.role == UserRole.teacher:
        return await _teacher_dashboard(session, madrasa, current_user)
    if current_user.role == UserRole.student:
        return await _student_dashboard(session, madrasa, current_user)
    return await _principal_dashboard(session, madrasa)


async def _principal_dashboard(session: AsyncSession, madrasa: Madrasa) -> dict[str, object]:
    today = datetime.now(timezone.utc).date()
    month_start = today.replace(day=1)
    active_session_id = await _active_session_id(session, madrasa.id)

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
    if active_session_id is None:
        class_count = (
            await session.execute(
                select(func.count()).select_from(AcademicClass).where(AcademicClass.madrasa_id == madrasa.id)
            )
        ).scalar_one()
        attendance_roster_count = 0
    else:
        enrolled_class_ids = set(
            (
                await session.execute(
                    select(Enrollment.class_id)
                    .join(StudentProfile, StudentProfile.id == Enrollment.student_id)
                    .where(
                        Enrollment.madrasa_id == madrasa.id,
                        Enrollment.session_id == active_session_id,
                        StudentProfile.status == "active",
                    )
                )
            ).scalars().all()
        )
        assigned_class_ids = set(
            (
                await session.execute(
                    select(TeacherAssignment.class_id).where(
                        TeacherAssignment.madrasa_id == madrasa.id,
                        TeacherAssignment.session_id == active_session_id,
                    )
                )
            ).scalars().all()
        )
        class_count = len(enrolled_class_ids | assigned_class_ids)
        attendance_roster_count = (
            await session.execute(
                select(func.count())
                .select_from(Enrollment)
                .join(StudentProfile, StudentProfile.id == Enrollment.student_id)
                .where(
                    Enrollment.madrasa_id == madrasa.id,
                    Enrollment.session_id == active_session_id,
                    StudentProfile.status == "active",
                )
            )
        ).scalar_one()

    attendance_counts = {"present": 0, "absent": 0, "leave": 0}
    if active_session_id is not None:
        rows = (
            await session.execute(
                select(StudentAttendance.status, func.count())
                .join(
                    Enrollment,
                    (Enrollment.student_id == StudentAttendance.student_id)
                    & (Enrollment.session_id == StudentAttendance.session_id),
                )
                .join(StudentProfile, StudentProfile.id == StudentAttendance.student_id)
                .where(
                    StudentAttendance.madrasa_id == madrasa.id,
                    StudentAttendance.session_id == active_session_id,
                    StudentAttendance.attendance_date == today,
                    Enrollment.madrasa_id == madrasa.id,
                    StudentProfile.status == "active",
                )
                .group_by(StudentAttendance.status)
            )
        ).all()
        for status_value, count in rows:
            attendance_counts[str(status_value.value if isinstance(status_value, AttendanceStatus) else status_value)] = count

    synced_teacher_ids = set()
    if active_session_id is not None:
        synced_teacher_ids = set(
            (
                await session.execute(
                    select(TeacherAttendance.teacher_id).where(
                        TeacherAttendance.madrasa_id == madrasa.id,
                        TeacherAttendance.session_id == active_session_id,
                        TeacherAttendance.attendance_date == today,
                    )
                )
            ).scalars().all()
        )
    missing_teachers = [t for t in teacher_rows if t.id not in synced_teacher_ids]
    missing_sync_teachers = len(missing_teachers)
    missing_sync_teacher_list = [{"id": str(t.id), "name": t.name} for t in missing_teachers]

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
        "role": "principal",
        "counts": {
            "students": student_count,
            "teachers": len(teacher_rows),
            "classes": class_count,
        },
        "attendance": {
            **attendance_counts,
            "total_students": attendance_roster_count,
            "missing_sync_teachers": missing_sync_teachers,
            "missing_sync_teacher_list": missing_sync_teacher_list,
        },
        "finance": {"month_total": float(payments) + float(donations), "currency": "PKR"},
        "activity": activity,
    }


async def _todays_timetable(session: AsyncSession, madrasa_id, **filters) -> list[dict[str, object]]:
    today_dow = datetime.now(timezone.utc).weekday()
    stmt = select(TimetableSlot).where(TimetableSlot.madrasa_id == madrasa_id, TimetableSlot.day_of_week == today_dow)
    for key, value in filters.items():
        stmt = stmt.where(getattr(TimetableSlot, key) == value)
    rows = (await session.execute(stmt.order_by(TimetableSlot.period))).scalars().all()
    return [
        {"course_id": str(r.course_id), "period": r.period, "start_time": r.start_time, "end_time": r.end_time}
        for r in rows
    ]


async def _teacher_dashboard(session: AsyncSession, madrasa: Madrasa, current_user: User) -> dict[str, object]:
    teacher = await _teacher_profile(session, current_user)
    if teacher is None:
        return {"role": "teacher", "my_classes": [], "pending_submissions": 0, "today_timetable": []}

    active_session_id = await _active_session_id(session, madrasa.id)

    assignment_rows = (
        await session.execute(
            select(TeacherAssignment.class_id, TeacherAssignment.course_id, AcademicClass.name, Course.name)
            .join(AcademicClass, AcademicClass.id == TeacherAssignment.class_id)
            .join(Course, Course.id == TeacherAssignment.course_id)
            .where(
                TeacherAssignment.madrasa_id == madrasa.id,
                TeacherAssignment.teacher_id == teacher.id,
                TeacherAssignment.session_id == active_session_id,
            )
        )
    ).all()
    my_classes = [
        {"class_id": str(class_id), "course_id": str(course_id), "class_name": class_name, "course_name": course_name}
        for class_id, course_id, class_name, course_name in assignment_rows
    ]
    class_ids = {row[0] for row in assignment_rows}

    pending_submissions = 0
    if class_ids:
        pending_submissions = (
            await session.execute(
                select(func.count())
                .select_from(Submission)
                .join(Assignment, Assignment.id == Submission.assignment_id)
                .where(Assignment.class_id.in_(class_ids), Submission.mark.is_(None))
            )
        ).scalar_one()

    today_timetable = await _todays_timetable(session, madrasa.id, teacher_id=teacher.id)

    return {
        "role": "teacher",
        "my_classes": my_classes,
        "pending_submissions": pending_submissions,
        "today_timetable": today_timetable,
    }


async def _student_dashboard(session: AsyncSession, madrasa: Madrasa, current_user: User) -> dict[str, object]:
    student = await _student_profile(session, current_user)
    if student is None:
        return {"role": "student", "today_timetable": [], "latest_result": None, "due_assignments": [], "resources": [], "announcements": []}

    active_session_id = await _active_session_id(session, madrasa.id)
    enrollment = None
    if active_session_id is not None:
        enrollment = (
            await session.execute(
                select(Enrollment)
                .where(Enrollment.student_id == student.id, Enrollment.session_id == active_session_id)
                .order_by(Enrollment.created_at.desc())
            )
        ).scalars().first()

    today_timetable = []
    due_assignments: list[dict[str, object]] = []
    latest_result = None
    if enrollment is not None:
        today_timetable = await _todays_timetable(
            session, madrasa.id, class_id=enrollment.class_id, section_id=enrollment.section_id
        )

        published = (
            await session.execute(
                select(ResultPublication).where(
                    ResultPublication.student_id == student.id, ResultPublication.session_id == active_session_id
                )
            )
        ).scalar_one_or_none()
        if published is not None:
            result = await _build_session_result(session, madrasa.id, student.id, active_session_id)
            latest_result = result.model_dump(mode="json")

        submitted_assignment_ids = set(
            (
                await session.execute(
                    select(Submission.assignment_id).where(Submission.student_id == student.id)
                )
            ).scalars().all()
        )
        now = datetime.now(timezone.utc)
        assignment_rows = (
            await session.execute(
                select(Assignment).where(
                    Assignment.madrasa_id == madrasa.id,
                    Assignment.class_id == enrollment.class_id,
                    Assignment.due_date >= now,
                )
            )
        ).scalars().all()
        due_assignments = [
            {"id": str(a.id), "title": a.title, "due_date": a.due_date.isoformat(), "course_id": str(a.course_id)}
            for a in assignment_rows
            if a.id not in submitted_assignment_ids and (not a.target_student_ids or str(student.id) in a.target_student_ids)
        ]

    viewer_class_id = enrollment.class_id if enrollment else None

    resource_rows = (
        await session.execute(select(Resource).where(Resource.madrasa_id == madrasa.id))
    ).scalars().all()
    resources = [
        {"id": str(r.id), "title": r.title}
        for r in resource_rows
        if _visible(r.visibility_scope, viewer_class_id)
    ]

    now = datetime.now(timezone.utc)
    announcement_rows = (
        await session.execute(select(Announcement).where(Announcement.madrasa_id == madrasa.id))
    ).scalars().all()
    announcements = [
        {"id": str(a.id), "title": a.title, "body": a.body}
        for a in announcement_rows
        if _visible(a.audience_scope, viewer_class_id) and (a.expires_at is None or a.expires_at >= now)
    ]

    return {
        "role": "student",
        "today_timetable": today_timetable,
        "latest_result": latest_result,
        "due_assignments": due_assignments,
        "resources": resources,
        "announcements": announcements,
    }


def _csv_response(filename: str, headers: list[str], rows: list[list[str]]) -> Response:
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(headers)
    writer.writerows(rows)
    return Response(
        content=buffer.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}.csv"'},
    )


def _pdf_response(filename: str, title: str, subtitle: str, headers: list[str], rows: list[list[str]]) -> Response:
    content = render_table_pdf(title, subtitle, headers, rows)
    return Response(
        content=content,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}.pdf"'},
    )


@router.get("/reports/attendance")
async def attendance_report(
    class_id: UUID,
    start_date: date = Query(...),
    end_date: date = Query(...),
    section_id: UUID | None = None,
    format: str = Query("csv", pattern="^(csv|pdf)$"),
    current_user: User = Depends(require_permission("attendance.take")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> Response:
    stmt = select(Enrollment, StudentProfile).join(StudentProfile, StudentProfile.id == Enrollment.student_id).where(
        Enrollment.madrasa_id == madrasa.id, Enrollment.class_id == class_id
    )
    if section_id:
        stmt = stmt.where(Enrollment.section_id == section_id)
    enrolled = (await session.execute(stmt)).all()
    if not enrolled:
        raise HTTPException(status_code=404, detail="No students enrolled for this class/section")

    rows = []
    for _enrollment, student in enrolled:
        summary = await compute_attendance_summary(
            session, madrasa.id, "student", student.id, start_date, end_date
        )
        rows.append(
            [student.admission_number, student.name, str(summary.present), str(summary.absent), str(summary.leave), str(summary.excluded_days)]
        )
    headers = ["Admission #", "Name", "Present", "Absent", "Leave", "Excluded (holiday/leave)"]

    filename = f"attendance-summary-{start_date}-to-{end_date}"
    if format == "csv":
        return _csv_response(filename, headers, rows)
    return _pdf_response(filename, "Attendance Summary", f"{start_date} to {end_date}", headers, rows)


@router.get("/reports/results")
async def results_report(
    class_id: UUID,
    session_id: UUID,
    section_id: UUID | None = None,
    format: str = Query("csv", pattern="^(csv|pdf)$"),
    current_user: User = Depends(require_permission("assessments.marks.enter")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> Response:
    stmt = (
        select(Enrollment, StudentProfile)
        .join(StudentProfile, StudentProfile.id == Enrollment.student_id)
        .where(
            Enrollment.madrasa_id == madrasa.id,
            Enrollment.class_id == class_id,
            Enrollment.session_id == session_id,
        )
    )
    if section_id:
        stmt = stmt.where(Enrollment.section_id == section_id)
    enrolled = (await session.execute(stmt)).all()
    if not enrolled:
        raise HTTPException(status_code=404, detail="No students enrolled for this class/section in this session")

    courses = (
        await session.execute(
            select(Course.id, Course.name)
            .where(Course.class_id == class_id, Course.madrasa_id == madrasa.id)
            .order_by(Course.name)
        )
    ).all()
    course_ids = [course_id for course_id, _name in courses]

    rows = []
    for _enrollment, student in enrolled:
        result = await _build_session_result(session, madrasa.id, student.id, session_id)
        by_course = {cr.course_id: cr for cr in result.course_results}
        score_cells = []
        for course_id in course_ids:
            cr = by_course.get(course_id)
            score_cells.append(f"{cr.raw_score:g}" if cr and cr.raw_score is not None else "—")
        overall = f"{result.overall_score:g}" if result.overall_score is not None else "—"
        rows.append([student.admission_number, student.name, *score_cells, overall])
    rows.sort(key=lambda row: row[1])
    headers = ["Admission #", "Name", *[name for _course_id, name in courses], "Overall"]

    academic_class = await session.get(AcademicClass, class_id)
    academic_session = await session.get(AcademicSession, session_id)
    class_name = academic_class.name if academic_class else str(class_id)
    session_name = academic_session.name if academic_session else str(session_id)

    filename = f"results-{class_name}-{session_name}".replace(" ", "-").lower()
    if format == "csv":
        return _csv_response(filename, headers, rows)
    return _pdf_response(filename, "Results Report", f"{class_name} — {session_name}", headers, rows)


@router.get("/reports/finance")
async def finance_report(
    start_date: date = Query(...),
    end_date: date = Query(...),
    format: str = Query("csv", pattern="^(csv|pdf)$"),
    current_user: User = Depends(require_permission("finance.reports.view")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> Response:
    payment_rows = (
        await session.execute(
            select(Payment.payment_date, StudentProfile.name, PaymentCategory.name, Payment.amount, Payment.currency)
            .join(StudentProfile, StudentProfile.id == Payment.student_id)
            .join(PaymentCategory, PaymentCategory.id == Payment.category_id)
            .where(Payment.madrasa_id == madrasa.id, Payment.payment_date >= start_date, Payment.payment_date <= end_date)
        )
    ).all()
    donation_rows = (
        await session.execute(
            select(Donation.donation_date, Donor.name, PaymentCategory.name, Donation.amount, Donation.currency)
            .join(Donor, Donor.id == Donation.donor_id)
            .join(PaymentCategory, PaymentCategory.id == Donation.category_id)
            .where(Donation.madrasa_id == madrasa.id, Donation.donation_date >= start_date, Donation.donation_date <= end_date)
        )
    ).all()

    rows = [
        [str(d), "Payment", name, category, f"{amount:.2f}", currency]
        for d, name, category, amount, currency in payment_rows
    ] + [
        [str(d), "Donation", name, category, f"{amount:.2f}", currency]
        for d, name, category, amount, currency in donation_rows
    ]
    rows.sort(key=lambda row: row[0])
    headers = ["Date", "Type", "Payer/Donor", "Category", "Amount", "Currency"]

    filename = f"finance-report-{start_date}-to-{end_date}"
    if format == "csv":
        return _csv_response(filename, headers, rows)
    return _pdf_response(filename, "Finance Report", f"{start_date} to {end_date}", headers, rows)
