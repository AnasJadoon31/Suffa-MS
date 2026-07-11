from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import record_audit
from app.core.dependencies import (
    ensure_writable_session,
    get_current_madrasa,
    get_current_user,
    require_permission,
    user_has_permission,
)
from app.core.hijri import to_hijri_string
from app.core.pdf import render_result_card_pdf
from app.core.teaching_scope import teacher_teaches
from app.db.session import get_session
from app.modules.academics.models import AcademicSession, ClassCourse, Course, Enrollment, Madrasa
from app.modules.assessments.models import Assignment, ExamType, GradingScheme, Mark, ResultPublication, Submission
from app.modules.assessments.schemas import (
    AssignmentCreate,
    AssignmentRead,
    AssignmentUpdate,
    CourseResult,
    ExamTypeCreate,
    ExamTypeRead,
    GradingSchemeCreate,
    GradingSchemeRead,
    MarkRead,
    MarkUpsert,
    PublishRequest,
    SessionResult,
    SubmissionCreate,
    SubmissionGrade,
    SubmissionRead,
)
from app.modules.auth.models import User, UserRole
from app.modules.people.models import StudentProfile, TeacherProfile

router = APIRouter()


# ------------------------------------------------------------- Scope helpers

async def _teacher_profile(session: AsyncSession, current_user: User) -> TeacherProfile | None:
    return (
        await session.execute(select(TeacherProfile).where(TeacherProfile.user_id == current_user.id))
    ).scalar_one_or_none()


async def _student_profile(session: AsyncSession, current_user: User) -> StudentProfile | None:
    return (
        await session.execute(select(StudentProfile).where(StudentProfile.user_id == current_user.id))
    ).scalar_one_or_none()


async def _active_session_id(session: AsyncSession, madrasa_id: UUID):
    from app.modules.academics.models import AcademicSession

    return (
        await session.execute(
            select(AcademicSession.id).where(AcademicSession.madrasa_id == madrasa_id, AcademicSession.is_active.is_(True))
        )
    ).scalar_one_or_none()


async def _require_class_course_scope(
    session: AsyncSession,
    current_user: User,
    madrasa_id: UUID,
    class_id: UUID,
    course_id: UUID,
    bypass_permission: str | None = None,
) -> None:
    """Enforces FR-RBAC-03: a teacher may only act on a class+course they are
    actually assigned to for the active session, unless they hold a
    supervisory/global permission that explicitly bypasses scope."""
    if current_user.role == UserRole.principal:
        return
    if bypass_permission and await user_has_permission(current_user, bypass_permission, session):
        return

    teacher = await _teacher_profile(session, current_user)
    if teacher is None:
        raise HTTPException(status_code=403, detail="Not assigned to this class/course")

    active_session_id = await _active_session_id(session, madrasa_id)
    # Timetable slots are the source of truth (∪ legacy TeacherAssignment rows).
    if not await teacher_teaches(
        session,
        madrasa_id=madrasa_id,
        teacher_id=teacher.id,
        session_id=active_session_id,
        class_id=class_id,
        course_id=course_id,
    ):
        raise HTTPException(status_code=403, detail="Not assigned to this class/course")


def _aware(value: datetime) -> datetime:
    # Postgres/asyncpg always returns tz-aware TIMESTAMPTZ values; some
    # backends (e.g. sqlite in tests) hand back naive ones instead.
    return value if value.tzinfo else value.replace(tzinfo=UTC)


async def _require_course_scope(
    session: AsyncSession,
    current_user: User,
    madrasa_id: UUID,
    course_id: UUID,
) -> None:
    """Courses are shared across classes (via ClassCourse), so a teacher is in
    scope when assigned to this course for any class in the active session."""
    course = await session.get(Course, course_id)
    if course is None or course.madrasa_id != madrasa_id:
        raise HTTPException(status_code=404, detail="Course not found")
    if current_user.role == UserRole.principal:
        return
    teacher = await _teacher_profile(session, current_user)
    if teacher is None:
        raise HTTPException(status_code=403, detail="Not assigned to this course")
    active_session_id = await _active_session_id(session, madrasa_id)
    if not await teacher_teaches(
        session,
        madrasa_id=madrasa_id,
        teacher_id=teacher.id,
        session_id=active_session_id,
        course_id=course_id,
    ):
        raise HTTPException(status_code=403, detail="Not assigned to this course")


# ------------------------------------------------------------------- Assignments

@router.post("/assignments", response_model=AssignmentRead)
async def create_assignment(
    payload: AssignmentCreate,
    current_user: User = Depends(require_permission("assignments.create")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> AssignmentRead:
    await _require_class_course_scope(
        session, current_user, madrasa.id, payload.class_id, payload.course_id, bypass_permission="assignments.create_any"
    )
    teacher = await _teacher_profile(session, current_user)
    if teacher is None and current_user.role != UserRole.principal:
        raise HTTPException(status_code=403, detail="Only teachers or the Principal can create assignments")

    assignment = Assignment(
        madrasa_id=madrasa.id,
        class_id=payload.class_id,
        course_id=payload.course_id,
        title=payload.title,
        instructions=payload.instructions,
        attachment_key=payload.attachment_key,
        due_date=payload.due_date,
        target_student_ids=[str(sid) for sid in payload.target_student_ids] or None,
        created_by_id=teacher.id if teacher else None,
    )
    session.add(assignment)
    await session.commit()
    await session.refresh(assignment)
    return AssignmentRead.model_validate(assignment)


@router.get("/assignments", response_model=list[AssignmentRead])
async def list_assignments(
    current_user: User = Depends(get_current_user),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
    class_id: UUID | None = None,
    course_id: UUID | None = None,
) -> list[AssignmentRead]:
    stmt = select(Assignment).where(Assignment.madrasa_id == madrasa.id)
    if class_id:
        stmt = stmt.where(Assignment.class_id == class_id)
    if course_id:
        stmt = stmt.where(Assignment.course_id == course_id)
    rows = (await session.execute(stmt.order_by(Assignment.due_date))).scalars().all()

    student = await _student_profile(session, current_user)
    if student is None:
        return [AssignmentRead.model_validate(row) for row in rows]

    def _visible(row: Assignment) -> bool:
        if not row.target_student_ids:
            return True
        return str(student.id) in row.target_student_ids

    return [AssignmentRead.model_validate(row) for row in rows if _visible(row)]


@router.get("/assignments/{assignment_id}", response_model=AssignmentRead)
async def get_assignment(
    assignment_id: UUID,
    current_user: User = Depends(get_current_user),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> AssignmentRead:
    assignment = await _get_assignment_or_404(session, assignment_id, madrasa.id)
    return AssignmentRead.model_validate(assignment)


@router.put("/assignments/{assignment_id}", response_model=AssignmentRead)
async def update_assignment(
    assignment_id: UUID,
    payload: AssignmentUpdate,
    current_user: User = Depends(require_permission("assignments.create")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> AssignmentRead:
    assignment = await _get_assignment_or_404(session, assignment_id, madrasa.id)
    await _require_class_course_scope(
        session, current_user, madrasa.id, assignment.class_id, assignment.course_id, bypass_permission="assignments.manage_all"
    )
    updates = payload.model_dump(exclude_unset=True)
    if "target_student_ids" in updates:
        ids = updates.pop("target_student_ids")
        assignment.target_student_ids = [str(sid) for sid in ids] if ids else None
    for field, value in updates.items():
        setattr(assignment, field, value)
    await session.commit()
    await session.refresh(assignment)
    return AssignmentRead.model_validate(assignment)


@router.post("/assignments/{assignment_id}/submissions", response_model=SubmissionRead)
async def submit_assignment(
    assignment_id: UUID,
    payload: SubmissionCreate,
    current_user: User = Depends(get_current_user),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> SubmissionRead:
    assignment = await _get_assignment_or_404(session, assignment_id, madrasa.id)
    student = await _student_profile(session, current_user)
    if student is None:
        raise HTTPException(status_code=403, detail="Only portal students can submit assignments")
    if assignment.target_student_ids and str(student.id) not in assignment.target_student_ids:
        raise HTTPException(status_code=403, detail="This assignment is not addressed to you")

    now = datetime.now(UTC)
    due_date = _aware(assignment.due_date)
    existing = (
        await session.execute(
            select(Submission).where(Submission.assignment_id == assignment_id, Submission.student_id == student.id)
        )
    ).scalar_one_or_none()
    if existing is not None:
        if now > due_date:
            raise HTTPException(status_code=400, detail="Resubmission is only allowed until the due date")
        existing.file_key = payload.file_key
        existing.submitted_at = now
        submission = existing
    else:
        submission = Submission(
            assignment_id=assignment_id, student_id=student.id, submitted_at=now, file_key=payload.file_key
        )
        session.add(submission)

    await session.commit()
    await session.refresh(submission)
    result = SubmissionRead.model_validate(submission)
    result.is_late = now > due_date
    return result


@router.get("/assignments/{assignment_id}/submissions", response_model=list[SubmissionRead])
async def list_submissions(
    assignment_id: UUID,
    current_user: User = Depends(require_permission("assignments.create")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> list[SubmissionRead]:
    assignment = await _get_assignment_or_404(session, assignment_id, madrasa.id)
    await _require_class_course_scope(
        session, current_user, madrasa.id, assignment.class_id, assignment.course_id, bypass_permission="assignments.view_all"
    )
    rows = (
        await session.execute(select(Submission).where(Submission.assignment_id == assignment_id))
    ).scalars().all()
    due_date = _aware(assignment.due_date)
    results = []
    for row in rows:
        item = SubmissionRead.model_validate(row)
        item.is_late = _aware(row.submitted_at) > due_date
        results.append(item)
    return results


@router.put("/submissions/{submission_id}/grade", response_model=SubmissionRead)
async def grade_submission(
    submission_id: UUID,
    payload: SubmissionGrade,
    current_user: User = Depends(require_permission("assignments.create")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> SubmissionRead:
    submission = await session.get(Submission, submission_id)
    if submission is None:
        raise HTTPException(status_code=404, detail="Submission not found")
    assignment = await _get_assignment_or_404(session, submission.assignment_id, madrasa.id)
    await _require_class_course_scope(
        session, current_user, madrasa.id, assignment.class_id, assignment.course_id, bypass_permission="assignments.manage_all"
    )
    if payload.mark is not None:
        submission.mark = payload.mark
    if payload.feedback is not None:
        submission.feedback = payload.feedback
    await session.commit()
    await session.refresh(submission)
    result = SubmissionRead.model_validate(submission)
    result.is_late = _aware(submission.submitted_at) > _aware(assignment.due_date)
    return result


async def _get_assignment_or_404(session: AsyncSession, assignment_id: UUID, madrasa_id: UUID) -> Assignment:
    assignment = await session.get(Assignment, assignment_id)
    if assignment is None or assignment.madrasa_id != madrasa_id:
        raise HTTPException(status_code=404, detail="Assignment not found")
    return assignment


# --------------------------------------------------------------- Grading schemes

@router.post("/grading-schemes", response_model=GradingSchemeRead)
async def create_grading_scheme(
    payload: GradingSchemeCreate,
    current_user: User = Depends(require_permission("grading.schemes.manage")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> GradingSchemeRead:
    scheme = GradingScheme(madrasa_id=madrasa.id, name=payload.name, bands=[b.model_dump() for b in payload.bands])
    session.add(scheme)
    await session.commit()
    await session.refresh(scheme)
    return GradingSchemeRead.model_validate(scheme)


@router.get("/grading-schemes", response_model=list[GradingSchemeRead])
async def list_grading_schemes(
    current_user: User = Depends(get_current_user),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> list[GradingSchemeRead]:
    rows = (await session.execute(select(GradingScheme).where(GradingScheme.madrasa_id == madrasa.id))).scalars().all()
    return [GradingSchemeRead.model_validate(row) for row in rows]


def _band_for_score(bands: list[dict], score: float) -> str | None:
    for band in bands:
        if band["min_score"] <= score <= band["max_score"]:
            return band["label"]
    return None


# -------------------------------------------------------------------- Exam types

@router.post("/exam-types", response_model=ExamTypeRead)
async def create_exam_type(
    payload: ExamTypeCreate,
    current_user: User = Depends(require_permission("assessments.exam_types.manage")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> ExamTypeRead:
    await _require_course_scope(session, current_user, madrasa.id, payload.course_id)

    exam_type = ExamType(
        madrasa_id=madrasa.id,
        course_id=payload.course_id,
        name=payload.name,
        weightage=payload.weightage,
        grading_scheme_id=payload.grading_scheme_id,
    )
    session.add(exam_type)
    await session.commit()
    await session.refresh(exam_type)
    return ExamTypeRead.model_validate(exam_type)


@router.get("/exam-types", response_model=list[ExamTypeRead])
async def list_exam_types(
    current_user: User = Depends(get_current_user),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
    course_id: UUID | None = None,
) -> list[ExamTypeRead]:
    stmt = select(ExamType).where(ExamType.madrasa_id == madrasa.id)
    if course_id:
        stmt = stmt.where(ExamType.course_id == course_id)
    rows = (await session.execute(stmt)).scalars().all()
    return [ExamTypeRead.model_validate(row) for row in rows]


# ------------------------------------------------------------------------- Marks

@router.put("/marks", response_model=MarkRead)
async def enter_mark(
    payload: MarkUpsert,
    current_user: User = Depends(require_permission("assessments.marks.enter")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> MarkRead:
    exam_type = await session.get(ExamType, payload.exam_type_id)
    if exam_type is None or exam_type.madrasa_id != madrasa.id:
        raise HTTPException(status_code=404, detail="Exam type not found")
    await _require_course_scope(session, current_user, madrasa.id, exam_type.course_id)

    teacher = await _teacher_profile(session, current_user)
    existing = (
        await session.execute(
            select(Mark).where(Mark.exam_type_id == payload.exam_type_id, Mark.student_id == payload.student_id)
        )
    ).scalar_one_or_none()
    if existing is not None:
        record_audit(
            session,
            madrasa_id=madrasa.id,
            actor_id=current_user.id,
            action="assessments.mark_overwrite",
            entity_name="mark",
            entity_id=str(existing.id),
            old_values={"score": existing.score},
            new_values={"score": payload.score},
        )
        existing.score = payload.score
        if teacher:
            existing.entered_by_id = teacher.id
        mark = existing
    else:
        mark = Mark(
            exam_type_id=payload.exam_type_id,
            student_id=payload.student_id,
            score=payload.score,
            entered_by_id=teacher.id if teacher else None,
        )
        session.add(mark)

    await session.commit()
    await session.refresh(mark)
    return MarkRead.model_validate(mark)


@router.get("/marks", response_model=list[MarkRead])
async def list_marks(
    current_user: User = Depends(require_permission("assessments.marks.enter")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
    exam_type_id: UUID | None = None,
) -> list[MarkRead]:
    stmt = select(Mark)
    if exam_type_id:
        stmt = stmt.where(Mark.exam_type_id == exam_type_id)
    rows = (await session.execute(stmt)).scalars().all()
    return [MarkRead.model_validate(row) for row in rows]


# ----------------------------------------------------------------------- Results

async def _compute_course_result(session: AsyncSession, madrasa_id: UUID, student_id: UUID, course_id: UUID) -> CourseResult:
    exam_types = (
        await session.execute(select(ExamType).where(ExamType.course_id == course_id, ExamType.madrasa_id == madrasa_id))
    ).scalars().all()
    if not exam_types:
        return CourseResult(course_id=course_id, raw_score=None, band=None, exam_count=0)

    total_weight = 0.0
    weighted_sum = 0.0
    count = 0
    last_scheme_id = None
    for exam_type in exam_types:
        mark = (
            await session.execute(
                select(Mark).where(Mark.exam_type_id == exam_type.id, Mark.student_id == student_id)
            )
        ).scalar_one_or_none()
        if mark is None:
            continue
        weighted_sum += mark.score * exam_type.weightage
        total_weight += exam_type.weightage
        count += 1
        last_scheme_id = exam_type.grading_scheme_id

    if total_weight == 0:
        return CourseResult(course_id=course_id, raw_score=None, band=None, exam_count=0)

    raw_score = weighted_sum / total_weight
    band = None
    if last_scheme_id is not None:
        scheme = await session.get(GradingScheme, last_scheme_id)
        if scheme is not None:
            band = _band_for_score(scheme.bands, raw_score)
    return CourseResult(course_id=course_id, raw_score=round(raw_score, 2), band=band, exam_count=count)


@router.get("/results/course", response_model=CourseResult)
async def get_course_result(
    student_id: UUID,
    course_id: UUID,
    current_user: User = Depends(get_current_user),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> CourseResult:
    return await _compute_course_result(session, madrasa.id, student_id, course_id)


@router.get("/results/session", response_model=SessionResult)
async def get_session_result(
    student_id: UUID,
    session_id: UUID,
    current_user: User = Depends(require_permission("assessments.marks.enter")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> SessionResult:
    return await _build_session_result(session, madrasa.id, student_id, session_id)


@router.get("/results/me", response_model=SessionResult)
async def get_my_result(
    session_id: UUID,
    current_user: User = Depends(get_current_user),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> SessionResult:
    student = await _student_profile(session, current_user)
    if student is None:
        raise HTTPException(status_code=403, detail="Only portal students can view their own results")
    published = (
        await session.execute(
            select(ResultPublication).where(
                ResultPublication.student_id == student.id, ResultPublication.session_id == session_id
            )
        )
    ).scalar_one_or_none()
    if published is None:
        raise HTTPException(status_code=403, detail="Results have not been published yet")
    return await _build_session_result(session, madrasa.id, student.id, session_id)


async def _build_session_result(session: AsyncSession, madrasa_id: UUID, student_id: UUID, session_id: UUID) -> SessionResult:
    enrollment = (
        await session.execute(
            select(Enrollment)
            .where(
                Enrollment.student_id == student_id,
                Enrollment.session_id == session_id,
                Enrollment.madrasa_id == madrasa_id,
            )
            .order_by(Enrollment.created_at.desc())
        )
    ).scalars().first()
    course_ids: list[UUID] = []
    if enrollment is not None:
        course_ids = [
            row
            for row in (
                await session.execute(
                    select(ClassCourse.course_id).where(
                        ClassCourse.class_id == enrollment.class_id, ClassCourse.madrasa_id == madrasa_id
                    )
                )
            ).scalars().all()
        ]

    course_results = [await _compute_course_result(session, madrasa_id, student_id, course_id) for course_id in course_ids]
    scored = [r.raw_score for r in course_results if r.raw_score is not None]
    overall = round(sum(scored) / len(scored), 2) if scored else None

    published = (
        await session.execute(
            select(ResultPublication).where(
                ResultPublication.student_id == student_id, ResultPublication.session_id == session_id
            )
        )
    ).scalar_one_or_none()

    return SessionResult(
        session_id=session_id,
        student_id=student_id,
        course_results=course_results,
        overall_score=overall,
        published=published is not None,
    )


@router.post("/results/publish")
async def publish_results(
    payload: PublishRequest,
    current_user: User = Depends(require_permission("assessments.results.publish")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> dict[str, object]:
    await ensure_writable_session(session, madrasa.id, payload.session_id)
    published_count = 0
    for student_id in payload.student_ids:
        existing = (
            await session.execute(
                select(ResultPublication).where(
                    ResultPublication.student_id == student_id, ResultPublication.session_id == payload.session_id
                )
            )
        ).scalar_one_or_none()
        if existing is None:
            session.add(
                ResultPublication(
                    madrasa_id=madrasa.id,
                    student_id=student_id,
                    session_id=payload.session_id,
                    published_by_id=current_user.id,
                )
            )
            published_count += 1
    await session.commit()
    return {"published": published_count, "session_id": payload.session_id}


async def _render_result_card(session: AsyncSession, madrasa_id: UUID, student: StudentProfile, session_id: UUID) -> bytes:
    result = await _build_session_result(session, madrasa_id, student.id, session_id)
    academic_session = await session.get(AcademicSession, session_id)

    course_names = dict(
        (
            await session.execute(
                select(Course.id, Course.name).where(
                    Course.id.in_([cr.course_id for cr in result.course_results])
                )
            )
        ).all()
    )
    course_rows = [
        [course_names.get(cr.course_id, str(cr.course_id)), f"{cr.raw_score:g}" if cr.raw_score is not None else "—", cr.band or "—"]
        for cr in result.course_results
    ]

    today = datetime.now(UTC).date()
    return render_result_card_pdf(
        student_name=student.name,
        admission_number=student.admission_number,
        session_name=academic_session.name if academic_session else str(session_id),
        gregorian_date=today.isoformat(),
        hijri_date=to_hijri_string(today),
        course_rows=course_rows,
        overall_score=f"{result.overall_score:g}" if result.overall_score is not None else "—",
        published=result.published,
    )


@router.get("/results/card/me")
async def get_my_result_card(
    session_id: UUID,
    current_user: User = Depends(get_current_user),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> Response:
    student = await _student_profile(session, current_user)
    if student is None:
        raise HTTPException(status_code=403, detail="Only portal students can view their own result card")
    published = (
        await session.execute(
            select(ResultPublication).where(
                ResultPublication.student_id == student.id, ResultPublication.session_id == session_id
            )
        )
    ).scalar_one_or_none()
    if published is None:
        raise HTTPException(status_code=403, detail="Results have not been published yet")

    pdf_bytes = await _render_result_card(session, madrasa.id, student, session_id)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="result-card-{student.admission_number}.pdf"'},
    )


@router.get("/results/card")
async def get_result_card(
    student_id: UUID,
    session_id: UUID,
    current_user: User = Depends(require_permission("assessments.marks.enter")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> Response:
    student = await session.get(StudentProfile, student_id)
    if student is None or student.madrasa_id != madrasa.id:
        raise HTTPException(status_code=404, detail="Student not found")

    pdf_bytes = await _render_result_card(session, madrasa.id, student, session_id)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="result-card-{student.admission_number}.pdf"'},
    )
