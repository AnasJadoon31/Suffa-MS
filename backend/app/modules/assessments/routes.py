from datetime import UTC, datetime
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from fastapi.responses import Response
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import record_audit
from app.core.dependencies import (
    ensure_writable_session,
    get_current_madrasa,
    get_current_user,
    require_permission,
    user_has_permission,
)
from app.core.error_codes import ErrorCode
from app.core.hijri import to_hijri_string
from app.core.pagination import DEFAULT_LIMIT, MAX_LIMIT, paginate_scalars
from app.core.pdf import load_report_branding, render_result_card_pdf
from app.core.teaching_scope import taught_pairs, teacher_teaches
from app.db.session import get_session
from app.modules.academics.models import AcademicClass, AcademicSession, ClassCourse, Course, Enrollment, Madrasa, Section
from app.modules.assessments.models import Assignment, ExamType, GradingScheme, Mark, ResultPublication, Submission
from app.modules.assessments.schemas import (
    AssignmentCreate,
    AssignmentRead,
    AssignmentUpdate,
    CourseResult,
    ExamTypeCreate,
    ExamTypeRead,
    ExamTypeUpdate,
    GradingSchemeCreate,
    GradingSchemeRead,
    GradingSchemeUpdate,
    MarkRead,
    MarkUpsert,
    MatrixCourse,
    MatrixCourseCell,
    MatrixExamType,
    MatrixMark,
    MatrixStudentRow,
    PublishRequest,
    ResultsMatrixResponse,
    SectionResultMatrix,
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


def require_assessment_staff(permission_code: str):
    """Allow explicitly delegated staff or a real teacher profile.

    Timetable scope is enforced by each handler after its class/course is
    known.  This dependency only opens that scoped path; it does not grant a
    teacher madrasa-wide access.
    """
    async def checker(
        current_user: User = Depends(get_current_user),
        session: AsyncSession = Depends(get_session),
    ) -> User:
        if await user_has_permission(current_user, permission_code, session):
            return current_user
        if current_user.role == UserRole.teacher and await _teacher_profile(session, current_user):
            return current_user
        raise HTTPException(status_code=403, detail=f"Missing permission: {permission_code}")

    return checker


async def _student_profile(session: AsyncSession, current_user: User, madrasa_id: UUID) -> StudentProfile | None:
    return (
        await session.execute(select(StudentProfile).where(
            StudentProfile.user_id == current_user.id,
            StudentProfile.madrasa_id == madrasa_id,
        ))
    ).scalar_one_or_none()


async def _require_student_assignment_access(
    session: AsyncSession,
    current_user: User,
    madrasa_id: UUID,
    assignment: Assignment,
) -> StudentProfile:
    student = await _student_profile(session, current_user, madrasa_id)
    if student is None:
        raise HTTPException(status_code=403, detail=ErrorCode.ASSIGNMENT_NOT_ASSIGNED)
    active_session_id = await _active_session_id(session, madrasa_id)
    enrollment = (
        await session.execute(
            select(Enrollment).where(
                Enrollment.madrasa_id == madrasa_id,
                Enrollment.session_id == active_session_id,
                Enrollment.student_id == student.id,
                Enrollment.class_id == assignment.class_id,
            )
        )
    ).scalar_one_or_none()
    if (
        enrollment is None
        or (assignment.section_id is not None and assignment.section_id != enrollment.section_id)
        or (assignment.target_student_ids and str(student.id) not in assignment.target_student_ids)
    ):
        raise HTTPException(status_code=403, detail=ErrorCode.ASSIGNMENT_NOT_ASSIGNED)
    return student


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
    section_id: UUID | None = None,
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
    # Timetable slots are the sole source of teaching scope.
    if not await teacher_teaches(
        session,
        madrasa_id=madrasa_id,
        teacher_id=teacher.id,
        session_id=active_session_id,
        class_id=class_id,
        course_id=course_id,
        section_id=section_id,
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


async def _require_student_course_scope(
    session: AsyncSession,
    current_user: User,
    madrasa_id: UUID,
    student_id: UUID,
    course_id: UUID,
) -> None:
    """Prevent a course teacher from grading another section's students."""
    student = await session.get(StudentProfile, student_id)
    if student is None or student.madrasa_id != madrasa_id:
        raise HTTPException(status_code=404, detail="Student not found")
    if current_user.role != UserRole.teacher:
        return
    active_session_id = await _active_session_id(session, madrasa_id)
    enrollment = (
        await session.execute(
            select(Enrollment).where(
                Enrollment.madrasa_id == madrasa_id,
                Enrollment.session_id == active_session_id,
                Enrollment.student_id == student_id,
            )
        )
    ).scalar_one_or_none()
    teacher = await _teacher_profile(session, current_user)
    if (
        enrollment is None
        or teacher is None
        or not await teacher_teaches(
            session,
            madrasa_id=madrasa_id,
            teacher_id=teacher.id,
            session_id=active_session_id,
            class_id=enrollment.class_id,
            course_id=course_id,
            section_id=enrollment.section_id,
        )
    ):
        raise HTTPException(status_code=403, detail="Student is not in your timetable section")


# ------------------------------------------------------------------- Assignments

@router.post("/assignments", response_model=list[AssignmentRead])
async def create_assignment(
    payload: AssignmentCreate,
    current_user: User = Depends(require_assessment_staff("assignments.create")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> list[AssignmentRead]:
    teacher = await _teacher_profile(session, current_user)
    if teacher is None and current_user.role != UserRole.principal:
        raise HTTPException(status_code=403, detail="Only teachers or the Principal can create assignments")

    # B8-j: publish to every class the course is mapped to, in one action —
    # reuses the same batch_id machinery as multi-section publish, just at
    # class granularity (one whole-class row per class) instead of section
    # granularity. Gated on assignments.manage_all (principal is an implicit
    # superuser via user_has_permission).
    if payload.all_classes:
        if not await user_has_permission(current_user, "assignments.manage_all", session):
            raise HTTPException(status_code=403, detail="Not permitted to publish to all classes")
        class_ids = (
            await session.execute(
                select(ClassCourse.class_id).where(
                    ClassCourse.madrasa_id == madrasa.id, ClassCourse.course_id == payload.course_id
                )
            )
        ).scalars().all()
        if not class_ids:
            raise HTTPException(status_code=400, detail="No classes have this course mapped")
        batch_id = uuid4() if len(class_ids) > 1 else None
        created: list[Assignment] = []
        for class_id in class_ids:
            assignment = Assignment(
                madrasa_id=madrasa.id,
                class_id=class_id,
                section_id=None,
                course_id=payload.course_id,
                title=payload.title,
                category=payload.category,
                instructions=payload.instructions,
                attachment_key=payload.attachment_key,
                due_date=payload.due_date,
                target_student_ids=[str(sid) for sid in payload.target_student_ids] or None,
                created_by_id=teacher.id if teacher else None,
                batch_id=batch_id,
            )
            session.add(assignment)
            created.append(assignment)
        await session.commit()
        for assignment in created:
            await session.refresh(assignment)
        return await _assignment_reads(session, madrasa.id, created)

    await _require_class_course_scope(
        session, current_user, madrasa.id, payload.class_id, payload.course_id, bypass_permission="assignments.create_any"
    )

    section_ids: list[UUID | None] = list(dict.fromkeys(payload.section_ids)) or [None]
    for section_id in section_ids:
        if section_id is None:
            continue
        section = await session.get(Section, section_id)
        if section is None or section.madrasa_id != madrasa.id or section.class_id != payload.class_id:
            raise HTTPException(status_code=400, detail="Section does not belong to the given class")
        # Multi-section publish: the teacher must actually teach this course
        # in every targeted section (admins/create_any bypass in scope check).
        if teacher is not None and current_user.role == UserRole.teacher:
            if not await user_has_permission(current_user, "assignments.create_any", session):
                active_session_id = await _active_session_id(session, madrasa.id)
                if not await teacher_teaches(
                    session,
                    madrasa_id=madrasa.id,
                    teacher_id=teacher.id,
                    session_id=active_session_id,
                    course_id=payload.course_id,
                    section_id=section_id,
                ):
                    raise HTTPException(status_code=403, detail="Not assigned to one of the targeted sections")

    batch_id = uuid4() if len(section_ids) > 1 else None
    created: list[Assignment] = []
    for section_id in section_ids:
        assignment = Assignment(
            madrasa_id=madrasa.id,
            class_id=payload.class_id,
            section_id=section_id,
            course_id=payload.course_id,
            title=payload.title,
            category=payload.category,
            instructions=payload.instructions,
            attachment_key=payload.attachment_key,
            due_date=payload.due_date,
            target_student_ids=[str(sid) for sid in payload.target_student_ids] or None,
            created_by_id=teacher.id if teacher else None,
            batch_id=batch_id,
        )
        session.add(assignment)
        created.append(assignment)
    await session.commit()
    for assignment in created:
        await session.refresh(assignment)
    return await _assignment_reads(session, madrasa.id, created)


async def _assignment_reads(session: AsyncSession, madrasa_id: UUID, rows: list[Assignment]) -> list[AssignmentRead]:
    """Attach display names (class/section/course/teacher) to assignment rows."""
    class_names = dict((await session.execute(select(AcademicClass.id, AcademicClass.name).where(AcademicClass.madrasa_id == madrasa_id))).all())
    section_names = dict((await session.execute(select(Section.id, Section.name).where(Section.madrasa_id == madrasa_id))).all())
    course_names = dict((await session.execute(select(Course.id, Course.name).where(Course.madrasa_id == madrasa_id))).all())
    teacher_names = dict((await session.execute(select(TeacherProfile.id, TeacherProfile.name).where(TeacherProfile.madrasa_id == madrasa_id))).all())
    reads = []
    for row in rows:
        data = AssignmentRead.model_validate(row).model_dump()
        data.update(
            class_name=class_names.get(row.class_id),
            section_name=section_names.get(row.section_id) if row.section_id else None,
            course_name=course_names.get(row.course_id),
            teacher_name=teacher_names.get(row.created_by_id) if row.created_by_id else None,
        )
        reads.append(AssignmentRead(**data))
    return reads


@router.get("/assignments", response_model=list[AssignmentRead])
async def list_assignments(
    response: Response,
    current_user: User = Depends(get_current_user),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
    class_id: UUID | None = None,
    section_id: UUID | None = None,
    course_id: UUID | None = None,
    category: str | None = None,
    created_by_id: UUID | None = None,
    sort: str = "due_date",  # due_date | created_at | title | teacher
    limit: int = Query(default=DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
) -> list[AssignmentRead]:
    stmt = select(Assignment).where(Assignment.madrasa_id == madrasa.id)
    if class_id:
        stmt = stmt.where(Assignment.class_id == class_id)
    if section_id:
        stmt = stmt.where((Assignment.section_id == section_id) | (Assignment.section_id.is_(None)))
    if course_id:
        stmt = stmt.where(Assignment.course_id == course_id)
    if category:
        stmt = stmt.where(Assignment.category == category)
    if created_by_id:
        stmt = stmt.where(Assignment.created_by_id == created_by_id)

    teacher = await _teacher_profile(session, current_user)
    if current_user.role == UserRole.teacher and not await user_has_permission(
        current_user, "assignments.view_all", session
    ):
        active_session_id = await _active_session_id(session, madrasa.id)
        pairs = await taught_pairs(
            session,
            madrasa_id=madrasa.id,
            teacher_id=teacher.id,
            session_id=active_session_id,
        ) if teacher is not None and active_session_id is not None else []
        if not pairs:
            response.headers["X-Total-Count"] = "0"
            return []
        stmt = stmt.where(or_(*(
            and_(
                Assignment.class_id == pair.class_id,
                Assignment.course_id == pair.course_id,
                or_(Assignment.section_id.is_(None), Assignment.section_id == pair.section_id),
            )
            for pair in pairs
        )))

    student = await _student_profile(session, current_user, madrasa.id)
    enrollment = None
    if student is not None:
        # Students: only their section's rows (or class-wide), pushed into
        # the SQL filter itself so it's applied before pagination/limit.
        active_session_id = await _active_session_id(session, madrasa.id)
        if active_session_id is not None:
            enrollment = (
                await session.execute(
                    select(Enrollment).where(
                        Enrollment.student_id == student.id,
                        Enrollment.session_id == active_session_id,
                    )
                )
            ).scalar_one_or_none()
        if enrollment is not None:
            stmt = stmt.where(
                (Assignment.section_id.is_(None)) | (Assignment.section_id == enrollment.section_id)
            )
            stmt = stmt.where(Assignment.class_id == enrollment.class_id)
        else:
            response.headers["X-Total-Count"] = "0"
            return []

    if sort == "teacher":
        stmt = stmt.outerjoin(TeacherProfile, Assignment.created_by_id == TeacherProfile.id)
    order_column = {
        "created_at": Assignment.created_at.desc(),
        "title": Assignment.title,
        "teacher": TeacherProfile.name,
    }.get(sort, Assignment.due_date)
    rows = await paginate_scalars(session, stmt.order_by(order_column), limit=limit, offset=offset, response=response)

    if student is not None:
        # target_student_ids is a JSON column; per-row containment can't be
        # pushed into a portable SQL WHERE (sqlite in tests vs Postgres
        # JSONB), so it's applied to the already-paginated page.
        rows = [row for row in rows if not row.target_student_ids or str(student.id) in row.target_student_ids]

    return await _assignment_reads(session, madrasa.id, list(rows))


@router.get("/assignments/{assignment_id}", response_model=AssignmentRead)
async def get_assignment(
    assignment_id: UUID,
    current_user: User = Depends(get_current_user),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> AssignmentRead:
    assignment = await _get_assignment_or_404(session, assignment_id, madrasa.id)
    student = await _student_profile(session, current_user, madrasa.id)
    if student is not None:
        await _require_student_assignment_access(session, current_user, madrasa.id, assignment)
    else:
        if (
            current_user.role != UserRole.principal
            and current_user.role != UserRole.teacher
            and not await user_has_permission(current_user, "assignments.create", session)
        ):
            raise HTTPException(status_code=403, detail=ErrorCode.ASSIGNMENT_NOT_ASSIGNED)
        await _require_class_course_scope(
            session, current_user, madrasa.id, assignment.class_id, assignment.course_id,
            section_id=assignment.section_id,
            bypass_permission="assignments.manage_all",
        )
    return AssignmentRead.model_validate(assignment)


@router.put("/assignments/{assignment_id}", response_model=AssignmentRead)
async def update_assignment(
    assignment_id: UUID,
    payload: AssignmentUpdate,
    current_user: User = Depends(require_assessment_staff("assignments.create")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> AssignmentRead:
    assignment = await _get_assignment_or_404(session, assignment_id, madrasa.id)
    await _require_class_course_scope(
        session, current_user, madrasa.id, assignment.class_id, assignment.course_id,
        section_id=assignment.section_id, bypass_permission="assignments.manage_all"
    )
    targets = [assignment]
    if payload.apply_to_batch and assignment.batch_id is not None:
        targets = (
            await session.execute(
                select(Assignment).where(
                    Assignment.madrasa_id == madrasa.id, Assignment.batch_id == assignment.batch_id
                )
            )
        ).scalars().all()
        for row in targets:
            await _require_class_course_scope(
                session, current_user, madrasa.id, row.class_id, row.course_id,
                section_id=row.section_id, bypass_permission="assignments.manage_all",
            )

    updates = payload.model_dump(exclude_unset=True, exclude={"apply_to_batch"})
    for row in targets:
        row_updates = dict(updates)
        if "target_student_ids" in row_updates:
            ids = row_updates.pop("target_student_ids")
            row.target_student_ids = [str(sid) for sid in ids] if ids else None
        for field, value in row_updates.items():
            setattr(row, field, value)
    await session.commit()
    await session.refresh(assignment)
    return AssignmentRead.model_validate(assignment)


@router.delete("/assignments/{assignment_id}")
async def delete_assignment(
    assignment_id: UUID,
    current_user: User = Depends(require_assessment_staff("assignments.create")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
    whole_batch: bool = False,
) -> dict[str, int | str]:
    assignment = await _get_assignment_or_404(session, assignment_id, madrasa.id)
    await _require_class_course_scope(
        session, current_user, madrasa.id, assignment.class_id, assignment.course_id,
        section_id=assignment.section_id, bypass_permission="assignments.manage_all"
    )
    targets = [assignment]
    if whole_batch and assignment.batch_id is not None:
        targets = (
            await session.execute(
                select(Assignment).where(
                    Assignment.madrasa_id == madrasa.id, Assignment.batch_id == assignment.batch_id
                )
            )
        ).scalars().all()
        for row in targets:
            await _require_class_course_scope(
                session, current_user, madrasa.id, row.class_id, row.course_id,
                section_id=row.section_id, bypass_permission="assignments.manage_all",
            )
    for row in targets:
        submissions = (
            await session.execute(select(Submission).where(Submission.assignment_id == row.id))
        ).scalars().all()
        for submission in submissions:
            await session.delete(submission)
        await session.delete(row)
    await session.commit()
    return {"status": "deleted", "count": len(targets)}


@router.post("/assignments/{assignment_id}/submissions", response_model=SubmissionRead)
async def submit_assignment(
    assignment_id: UUID,
    payload: SubmissionCreate,
    current_user: User = Depends(get_current_user),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> SubmissionRead:
    assignment = await _get_assignment_or_404(session, assignment_id, madrasa.id)
    student = await _require_student_assignment_access(session, current_user, madrasa.id, assignment)

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
    response: Response,
    current_user: User = Depends(require_assessment_staff("assignments.create")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
    limit: int = Query(default=DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
) -> list[SubmissionRead]:
    assignment = await _get_assignment_or_404(session, assignment_id, madrasa.id)
    await _require_class_course_scope(
        session, current_user, madrasa.id, assignment.class_id, assignment.course_id,
        section_id=assignment.section_id, bypass_permission="assignments.view_all"
    )
    rows = await paginate_scalars(
        session,
        select(Submission).where(Submission.assignment_id == assignment_id).order_by(Submission.submitted_at),
        limit=limit, offset=offset, response=response,
    )
    due_date = _aware(assignment.due_date)
    student_names = dict((await session.execute(
        select(StudentProfile.id, StudentProfile.name).where(
            StudentProfile.id.in_({row.student_id for row in rows})
        )
    )).all()) if rows else {}
    results = []
    for row in rows:
        item = SubmissionRead.model_validate(row)
        item.is_late = _aware(row.submitted_at) > due_date
        item.student_name = student_names.get(row.student_id)
        results.append(item)
    return results


@router.put("/submissions/{submission_id}/grade", response_model=SubmissionRead)
async def grade_submission(
    submission_id: UUID,
    payload: SubmissionGrade,
    current_user: User = Depends(require_assessment_staff("assignments.create")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> SubmissionRead:
    submission = await session.get(Submission, submission_id)
    if submission is None:
        raise HTTPException(status_code=404, detail="Submission not found")
    assignment = await _get_assignment_or_404(session, submission.assignment_id, madrasa.id)
    await _require_class_course_scope(
        session, current_user, madrasa.id, assignment.class_id, assignment.course_id,
        section_id=assignment.section_id, bypass_permission="assignments.manage_all"
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
    response: Response,
    current_user: User = Depends(get_current_user),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
    limit: int = Query(default=DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
) -> list[GradingSchemeRead]:
    rows = await paginate_scalars(
        session, select(GradingScheme).where(GradingScheme.madrasa_id == madrasa.id).order_by(GradingScheme.name),
        limit=limit, offset=offset, response=response,
    )
    return [GradingSchemeRead.model_validate(row) for row in rows]


@router.put("/grading-schemes/{scheme_id}", response_model=GradingSchemeRead)
async def update_grading_scheme(
    scheme_id: UUID,
    payload: GradingSchemeUpdate,
    current_user: User = Depends(require_permission("grading.schemes.manage")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> GradingSchemeRead:
    scheme = await session.get(GradingScheme, scheme_id)
    if scheme is None or scheme.madrasa_id != madrasa.id:
        raise HTTPException(status_code=404, detail="Grading scheme not found")
    if payload.name is not None:
        scheme.name = payload.name
    if payload.bands is not None:
        scheme.bands = [band.model_dump() for band in payload.bands]
    await session.commit()
    await session.refresh(scheme)
    return GradingSchemeRead.model_validate(scheme)


@router.delete("/grading-schemes/{scheme_id}")
async def delete_grading_scheme(
    scheme_id: UUID,
    current_user: User = Depends(require_permission("grading.schemes.manage")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> dict[str, str]:
    scheme = await session.get(GradingScheme, scheme_id)
    if scheme is None or scheme.madrasa_id != madrasa.id:
        raise HTTPException(status_code=404, detail="Grading scheme not found")
    if await session.scalar(select(ExamType.id).where(ExamType.grading_scheme_id == scheme_id).limit(1)):
        raise HTTPException(status_code=409, detail="Cannot delete a grading scheme used by an exam type")
    await session.delete(scheme)
    await session.commit()
    return {"status": "deleted"}


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
    scheme = await session.get(GradingScheme, payload.grading_scheme_id)
    if scheme is None or scheme.madrasa_id != madrasa.id:
        raise HTTPException(status_code=404, detail="Grading scheme not found")

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
    response: Response,
    current_user: User = Depends(get_current_user),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
    course_id: UUID | None = None,
    limit: int = Query(default=DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
) -> list[ExamTypeRead]:
    stmt = select(ExamType).where(ExamType.madrasa_id == madrasa.id)
    if course_id:
        stmt = stmt.where(ExamType.course_id == course_id)
    rows = await paginate_scalars(session, stmt.order_by(ExamType.name), limit=limit, offset=offset, response=response)
    return [ExamTypeRead.model_validate(row) for row in rows]


@router.put("/exam-types/{exam_type_id}", response_model=ExamTypeRead)
async def update_exam_type(
    exam_type_id: UUID,
    payload: ExamTypeUpdate,
    current_user: User = Depends(require_permission("assessments.exam_types.manage")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> ExamTypeRead:
    exam_type = await session.get(ExamType, exam_type_id)
    if exam_type is None or exam_type.madrasa_id != madrasa.id:
        raise HTTPException(status_code=404, detail="Exam type not found")
    target_course_id = payload.course_id or exam_type.course_id
    await _require_course_scope(session, current_user, madrasa.id, target_course_id)
    if payload.grading_scheme_id is not None:
        scheme = await session.get(GradingScheme, payload.grading_scheme_id)
        if scheme is None or scheme.madrasa_id != madrasa.id:
            raise HTTPException(status_code=404, detail="Grading scheme not found")
        exam_type.grading_scheme_id = payload.grading_scheme_id
    if payload.course_id is not None:
        exam_type.course_id = payload.course_id
    if payload.name is not None:
        exam_type.name = payload.name
    if payload.weightage is not None:
        exam_type.weightage = payload.weightage
    await session.commit()
    await session.refresh(exam_type)
    return ExamTypeRead.model_validate(exam_type)


@router.delete("/exam-types/{exam_type_id}")
async def delete_exam_type(
    exam_type_id: UUID,
    current_user: User = Depends(require_permission("assessments.exam_types.manage")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> dict[str, str]:
    exam_type = await session.get(ExamType, exam_type_id)
    if exam_type is None or exam_type.madrasa_id != madrasa.id:
        raise HTTPException(status_code=404, detail="Exam type not found")
    await _require_course_scope(session, current_user, madrasa.id, exam_type.course_id)
    if await session.scalar(select(Mark.id).where(Mark.exam_type_id == exam_type_id).limit(1)):
        raise HTTPException(status_code=409, detail="Cannot delete an exam type that already has marks")
    await session.delete(exam_type)
    await session.commit()
    return {"status": "deleted"}


# ------------------------------------------------------------------------- Marks

@router.put("/marks", response_model=MarkRead)
async def enter_mark(
    payload: MarkUpsert,
    current_user: User = Depends(require_assessment_staff("assessments.marks.enter")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> MarkRead:
    exam_type = await session.get(ExamType, payload.exam_type_id)
    if exam_type is None or exam_type.madrasa_id != madrasa.id:
        raise HTTPException(status_code=404, detail="Exam type not found")
    await _require_course_scope(session, current_user, madrasa.id, exam_type.course_id)
    await _require_student_course_scope(
        session, current_user, madrasa.id, payload.student_id, exam_type.course_id
    )

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
    response: Response,
    current_user: User = Depends(require_permission("assessments.marks.enter")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
    exam_type_id: UUID | None = None,
    limit: int = Query(default=DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
) -> list[MarkRead]:
    stmt = select(Mark)
    if exam_type_id:
        stmt = stmt.where(Mark.exam_type_id == exam_type_id)
    rows = await paginate_scalars(
        session, stmt.order_by(Mark.created_at, Mark.id), limit=limit, offset=offset, response=response
    )
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
    current_user: User = Depends(require_permission("assessments.marks.enter")),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> CourseResult:
    student = await session.get(StudentProfile, student_id)
    if student is None or student.madrasa_id != madrasa.id:
        raise HTTPException(status_code=404, detail="Student not found")
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
    student = await _student_profile(session, current_user, madrasa.id)
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
    madrasa = await session.get(Madrasa, madrasa_id)
    return render_result_card_pdf(
        student_name=student.name,
        admission_number=student.admission_number,
        session_name=academic_session.name if academic_session else str(session_id),
        gregorian_date=today.isoformat(),
        hijri_date=to_hijri_string(today),
        course_rows=course_rows,
        overall_score=f"{result.overall_score:g}" if result.overall_score is not None else "—",
        published=result.published,
        branding=await load_report_branding(session, madrasa) if madrasa else None,
    )


@router.get("/results/card/me")
async def get_my_result_card(
    session_id: UUID,
    current_user: User = Depends(get_current_user),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
) -> Response:
    student = await _student_profile(session, current_user, madrasa.id)
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


# ------------------------------------------------- Results matrix (§5)

async def _teacher_names_by_section_course(
    session: AsyncSession, madrasa_id: UUID, session_id: UUID, class_id: UUID
) -> dict[tuple[UUID | None, UUID], str]:
    """(section_id, course_id) → teacher name from timetable slots."""
    from app.modules.operations.models import TimetableSlot

    names: dict[tuple[UUID | None, UUID], str] = {}
    slot_rows = (
        await session.execute(
            select(TimetableSlot.section_id, TimetableSlot.course_id, TeacherProfile.name)
            .join(TeacherProfile, TeacherProfile.id == TimetableSlot.teacher_id)
            .where(
                TimetableSlot.madrasa_id == madrasa_id,
                TimetableSlot.session_id == session_id,
                TimetableSlot.class_id == class_id,
            )
            .distinct()
        )
    ).all()
    for section_id, course_id, name in slot_rows:
        names[(section_id, course_id)] = name
    return names


async def _section_matrix(
    session: AsyncSession,
    madrasa_id: UUID,
    section: Section,
    active_session_id: UUID,
    allowed_course_ids: set[UUID] | None = None,
) -> SectionResultMatrix:
    academic_class = await session.get(AcademicClass, section.class_id)

    course_stmt = (
        select(Course)
        .join(ClassCourse, ClassCourse.course_id == Course.id)
        .where(ClassCourse.class_id == section.class_id)
    )
    if allowed_course_ids is not None:
        course_stmt = course_stmt.where(Course.id.in_(allowed_course_ids))
    course_rows = (await session.execute(course_stmt.order_by(Course.name))).scalars().all()

    exam_types_by_course: dict[UUID, list[ExamType]] = {}
    for course in course_rows:
        exam_types_by_course[course.id] = (
            await session.execute(
                select(ExamType).where(ExamType.course_id == course.id, ExamType.madrasa_id == madrasa_id)
            )
        ).scalars().all()

    teacher_names = await _teacher_names_by_section_course(session, madrasa_id, active_session_id, section.class_id)
    matrix_courses = [
        MatrixCourse(
            course_id=course.id,
            course_name=course.name,
            teacher_name=teacher_names.get((section.id, course.id)) or teacher_names.get((None, course.id)),
            exam_types=[
                MatrixExamType(id=et.id, name=et.name, weightage=et.weightage)
                for et in exam_types_by_course[course.id]
            ],
        )
        for course in course_rows
    ]

    students = (
        await session.execute(
            select(StudentProfile)
            .join(Enrollment, Enrollment.student_id == StudentProfile.id)
            .where(
                Enrollment.section_id == section.id,
                Enrollment.session_id == active_session_id,
            )
            .order_by(StudentProfile.name)
        )
    ).scalars().all()

    all_exam_type_ids = [et.id for ets in exam_types_by_course.values() for et in ets]
    marks: dict[tuple[UUID, UUID], float] = {}
    if all_exam_type_ids and students:
        mark_rows = (
            await session.execute(
                select(Mark).where(
                    Mark.exam_type_id.in_(all_exam_type_ids),
                    Mark.student_id.in_([s.id for s in students]),
                )
            )
        ).scalars().all()
        marks = {(m.student_id, m.exam_type_id): m.score for m in mark_rows}

    scheme_cache: dict[UUID, GradingScheme | None] = {}

    async def _scheme(scheme_id: UUID) -> GradingScheme | None:
        if scheme_id not in scheme_cache:
            scheme_cache[scheme_id] = await session.get(GradingScheme, scheme_id)
        return scheme_cache[scheme_id]

    student_rows: list[MatrixStudentRow] = []
    for student in students:
        cells: list[MatrixCourseCell] = []
        scored: list[float] = []
        for course in course_rows:
            exam_types = exam_types_by_course[course.id]
            cell_marks = [
                MatrixMark(exam_type_id=et.id, score=marks.get((student.id, et.id)))
                for et in exam_types
            ]
            weighted_sum = 0.0
            total_weight = 0.0
            last_scheme_id = None
            for et in exam_types:
                score = marks.get((student.id, et.id))
                if score is None:
                    continue
                weighted_sum += score * et.weightage
                total_weight += et.weightage
                last_scheme_id = et.grading_scheme_id
            raw_score = round(weighted_sum / total_weight, 2) if total_weight else None
            band = None
            if raw_score is not None and last_scheme_id is not None:
                scheme = await _scheme(last_scheme_id)
                if scheme is not None:
                    band = _band_for_score(scheme.bands, raw_score)
            if raw_score is not None:
                scored.append(raw_score)
            cells.append(MatrixCourseCell(course_id=course.id, raw_score=raw_score, band=band, marks=cell_marks))
        student_rows.append(
            MatrixStudentRow(
                student_id=student.id,
                name=student.name,
                admission_number=student.admission_number,
                courses=cells,
                overall_score=round(sum(scored) / len(scored), 2) if scored else None,
            )
        )

    return SectionResultMatrix(
        class_id=section.class_id,
        class_name=academic_class.name if academic_class else "",
        section_id=section.id,
        section_name=section.name,
        courses=matrix_courses,
        students=student_rows,
    )


async def _matrix_sections(
    session: AsyncSession,
    current_user: User,
    madrasa: Madrasa,
    section_id: UUID | None,
    class_id: UUID | None,
) -> tuple[UUID, list[Section], dict[UUID, set[UUID]] | None]:
    if section_id is None and class_id is None:
        raise HTTPException(status_code=400, detail="Pass section_id or class_id")
    active_session_id = await _active_session_id(session, madrasa.id)
    if active_session_id is None:
        raise HTTPException(status_code=404, detail="No active academic session")

    if section_id is not None:
        section = await session.get(Section, section_id)
        if section is None or section.madrasa_id != madrasa.id:
            raise HTTPException(status_code=404, detail="Section not found")
        sections = [section]
    else:
        sections = (
            await session.execute(
                select(Section).where(Section.class_id == class_id, Section.madrasa_id == madrasa.id).order_by(Section.name)
            )
        ).scalars().all()
        if not sections:
            raise HTTPException(status_code=404, detail="Class has no sections")

    course_scope: dict[UUID, set[UUID]] | None = None
    # Authorization: principal (implicit) or global marks permission. A
    # timetable-scoped teacher sees just the sections/courses they teach.
    if current_user.role != UserRole.principal and not await user_has_permission(
        current_user, "assessments.marks.enter", session
    ):
        teacher = await _teacher_profile(session, current_user)
        if teacher is None:
            raise HTTPException(status_code=403, detail="Not allowed to view these results")
        pairs = await taught_pairs(
            session,
            madrasa_id=madrasa.id,
            teacher_id=teacher.id,
            session_id=active_session_id,
        )
        course_scope = {}
        for pair in pairs:
            course_scope.setdefault(pair.section_id, set()).add(pair.course_id)
        sections = [section for section in sections if section.id in course_scope]
        if not sections:
            raise HTTPException(status_code=403, detail="Not allowed to view these results")

    return active_session_id, sections, course_scope


@router.get("/results/matrix", response_model=ResultsMatrixResponse)
async def get_results_matrix(
    current_user: User = Depends(get_current_user),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
    section_id: UUID | None = None,
    class_id: UUID | None = None,
) -> ResultsMatrixResponse:
    active_session_id, sections, course_scope = await _matrix_sections(
        session, current_user, madrasa, section_id, class_id
    )
    return ResultsMatrixResponse(
        session_id=active_session_id,
        sections=[
            await _section_matrix(
                session,
                madrasa.id,
                section,
                active_session_id,
                course_scope.get(section.id, set()) if course_scope is not None else None,
            )
            for section in sections
        ],
    )


@router.get("/results/export")
async def export_results(
    current_user: User = Depends(get_current_user),
    madrasa: Madrasa = Depends(get_current_madrasa),
    session: AsyncSession = Depends(get_session),
    section_id: UUID | None = None,
    class_id: UUID | None = None,
    format: str = "csv",  # csv | pdf
) -> Response:
    """Report-style export: one block per section, each ending with the
    course → teacher summary the report footer requires (IMPLEMENT.md §5)."""
    import csv
    import io

    from app.core.pdf import load_report_branding, render_table_pdf

    active_session_id, sections, course_scope = await _matrix_sections(
        session, current_user, madrasa, section_id, class_id
    )
    matrices = [
        await _section_matrix(
            session,
            madrasa.id,
            section,
            active_session_id,
            course_scope.get(section.id, set()) if course_scope is not None else None,
        )
        for section in sections
    ]

    if format == "pdf":
        # One PDF per export; sections stacked as header rows inside the table.
        headers = ["Student", "Adm #"]
        first = matrices[0]
        headers += [c.course_name for c in first.courses] + ["Overall"]
        rows: list[list[str]] = []
        for matrix in matrices:
            rows.append([f"— {matrix.class_name} / {matrix.section_name} —"] + [""] * (len(headers) - 1))
            for student in matrix.students:
                rows.append(
                    [student.name, student.admission_number]
                    + [f"{c.raw_score} ({c.band})" if c.raw_score is not None else "—" for c in student.courses]
                    + [str(student.overall_score) if student.overall_score is not None else "—"]
                )
            rows.append(["Course teachers:"] + [""] * (len(headers) - 1))
            for course in matrix.courses:
                rows.append([course.course_name, course.teacher_name or "—"] + [""] * (len(headers) - 2))
        pdf_bytes = render_table_pdf(
            "Results", f"{madrasa.name} — session results", headers, rows,
            await load_report_branding(session, madrasa),
        )
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": 'attachment; filename="results.pdf"'},
        )

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    for matrix in matrices:
        writer.writerow([f"{matrix.class_name} / {matrix.section_name}"])
        writer.writerow(
            ["Student", "Admission #"] + [c.course_name for c in matrix.courses] + ["Overall"]
        )
        for student in matrix.students:
            writer.writerow(
                [student.name, student.admission_number]
                + [c.raw_score if c.raw_score is not None else "" for c in student.courses]
                + [student.overall_score if student.overall_score is not None else ""]
            )
        writer.writerow([])
        writer.writerow(["Course", "Teacher"])
        for course in matrix.courses:
            writer.writerow([course.course_name, course.teacher_name or ""])
        writer.writerow([])
    return Response(
        content=buffer.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="results.csv"'},
    )
