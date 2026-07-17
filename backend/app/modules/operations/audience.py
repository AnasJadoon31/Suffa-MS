"""Unified audience targeting (IMPLEMENT.md §6).

One resolver decides "who sees this" for announcements, resources, forms (and
assignment targeting as those screens are reworked). The scope is a JSON dict
stored on the row:

    {"all": true}
    {"roles": ["teacher"]}                       # role gate
    {"classes": [...], "sections": [...],        # targeting: ANY match wins
     "courses": [...], "users": [...]}

Rules:
- ``all`` → visible to everyone in the madrasa.
- ``roles`` (if present) must include the viewer's role, else denied.
- If no targeting key is present the item is visible to anyone passing the
  role gate. Otherwise at least one targeting rule must match the viewer:
  students match via their enrollment (class, section, and the class's
  courses); teachers via what they teach in the timetable;
  ``users`` matches explicit user ids. The principal always sees everything.
"""
from dataclasses import dataclass, field
from typing import Optional
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.teaching_scope import taught_pairs
from app.modules.academics.models import AcademicSession, ClassCourse, Enrollment
from app.modules.auth.models import User, UserRole
from app.modules.people.models import StudentProfile, TeacherProfile


@dataclass(frozen=True)
class ViewerContext:
    role: str
    user_id: UUID
    class_ids: frozenset[UUID] = field(default_factory=frozenset)
    section_ids: frozenset[UUID] = field(default_factory=frozenset)
    course_ids: frozenset[UUID] = field(default_factory=frozenset)


async def get_viewer_context(db: AsyncSession, user: User, madrasa_id: UUID) -> ViewerContext:
    active_session_id = (
        await db.execute(
            select(AcademicSession.id).where(
                AcademicSession.madrasa_id == madrasa_id, AcademicSession.is_active.is_(True)
            )
        )
    ).scalar_one_or_none()

    if user.role == UserRole.student and active_session_id is not None:
        profile = (
            await db.execute(select(StudentProfile).where(StudentProfile.user_id == user.id))
        ).scalar_one_or_none()
        if profile is not None:
            enrollment = (
                await db.execute(
                    select(Enrollment).where(
                        Enrollment.student_id == profile.id,
                        Enrollment.session_id == active_session_id,
                    )
                )
            ).scalar_one_or_none()
            if enrollment is not None:
                course_ids = set(
                    (
                        await db.execute(
                            select(ClassCourse.course_id).where(ClassCourse.class_id == enrollment.class_id)
                        )
                    ).scalars().all()
                )
                return ViewerContext(
                    role=user.role.value,
                    user_id=user.id,
                    class_ids=frozenset({enrollment.class_id}),
                    section_ids=frozenset({enrollment.section_id}),
                    course_ids=frozenset(course_ids),
                )

    if user.role == UserRole.teacher and active_session_id is not None:
        teacher = (
            await db.execute(select(TeacherProfile).where(TeacherProfile.user_id == user.id))
        ).scalar_one_or_none()
        if teacher is not None:
            pairs = await taught_pairs(
                db, madrasa_id=madrasa_id, teacher_id=teacher.id, session_id=active_session_id
            )
            return ViewerContext(
                role=user.role.value,
                user_id=user.id,
                class_ids=frozenset(pair.class_id for pair in pairs),
                section_ids=frozenset(pair.section_id for pair in pairs if pair.section_id),
                course_ids=frozenset(pair.course_id for pair in pairs),
            )

    return ViewerContext(role=user.role.value, user_id=user.id)


_TARGET_KEYS = ("classes", "sections", "courses", "users")


def scope_allows(scope: Optional[dict], ctx: ViewerContext) -> bool:
    if ctx.role in (UserRole.principal.value, UserRole.super_admin.value):
        return True
    scope = scope or {}
    if scope.get("all"):
        return True

    allowed_roles = scope.get("roles") or []
    if allowed_roles and ctx.role not in allowed_roles:
        return False

    if not any(scope.get(key) for key in _TARGET_KEYS):
        return True

    def _ids(key: str) -> set[str]:
        return {str(value) for value in scope.get(key) or []}

    if _ids("users") & {str(ctx.user_id)}:
        return True
    if _ids("classes") & {str(i) for i in ctx.class_ids}:
        return True
    if _ids("sections") & {str(i) for i in ctx.section_ids}:
        return True
    if _ids("courses") & {str(i) for i in ctx.course_ids}:
        return True
    return False
