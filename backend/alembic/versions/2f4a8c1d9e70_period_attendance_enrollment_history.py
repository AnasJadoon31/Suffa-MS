"""period attendance and effective-dated enrollment history

Revision ID: 2f4a8c1d9e70
Revises: 07f9f73c86fc
Create Date: 2026-07-22
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "2f4a8c1d9e70"
down_revision: Union[str, None] = "07f9f73c86fc"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("student_attendance", sa.Column("course_id", sa.Uuid(), nullable=True))
    op.add_column("student_attendance", sa.Column("timetable_slot_id", sa.Uuid(), nullable=True))
    op.create_foreign_key(
        "fk_student_attendance_course", "student_attendance", "courses", ["course_id"], ["id"]
    )
    op.create_check_constraint(
        "ck_student_attendance_period_scope_complete",
        "student_attendance",
        "(course_id IS NULL) = (timetable_slot_id IS NULL)",
    )
    op.create_foreign_key(
        "fk_student_attendance_timetable_slot",
        "student_attendance", "timetable_slots", ["timetable_slot_id"], ["id"],
    )
    op.create_index(op.f("ix_student_attendance_course_id"), "student_attendance", ["course_id"])
    op.create_index(
        op.f("ix_student_attendance_timetable_slot_id"), "student_attendance", ["timetable_slot_id"]
    )
    op.drop_constraint("uq_student_attendance_day", "student_attendance", type_="unique")
    op.create_unique_constraint(
        "uq_student_attendance_period",
        "student_attendance",
        ["student_id", "session_id", "attendance_date", "timetable_slot_id"],
    )
    op.create_index(
        "uq_student_attendance_legacy_day",
        "student_attendance",
        ["student_id", "session_id", "attendance_date"],
        unique=True,
        postgresql_where=sa.text("timetable_slot_id IS NULL"),
    )

    op.add_column("enrollments", sa.Column("started_on", sa.Date(), nullable=True))
    op.add_column("enrollments", sa.Column("ended_on", sa.Date(), nullable=True))
    op.execute(
        """
        UPDATE enrollments
        SET started_on = academic_sessions.gregorian_start
        FROM academic_sessions
        WHERE academic_sessions.id = enrollments.session_id
          AND enrollments.started_on IS NULL
        """
    )
    op.alter_column("enrollments", "started_on", nullable=False)
    op.create_check_constraint(
        "ck_enrollment_dates", "enrollments", "ended_on IS NULL OR ended_on >= started_on"
    )
    op.drop_constraint("uq_enrollment_student_session", "enrollments", type_="unique")
    op.create_index(
        "uq_enrollment_active_student_session",
        "enrollments",
        ["student_id", "session_id"],
        unique=True,
        postgresql_where=sa.text("ended_on IS NULL"),
    )


def downgrade() -> None:
    # The old schema cannot represent histories or multiple periods. Retain
    # the active/latest row for each old identity before restoring constraints.
    op.execute(
        """
        DELETE FROM enrollments old
        USING enrollments keep
        WHERE old.student_id = keep.student_id
          AND old.session_id = keep.session_id
          AND (old.ended_on IS NOT NULL AND keep.ended_on IS NULL
               OR (old.ended_on IS NOT NULL AND keep.ended_on IS NOT NULL
                   AND old.started_on < keep.started_on))
        """
    )
    op.drop_index("uq_enrollment_active_student_session", table_name="enrollments")
    op.create_unique_constraint(
        "uq_enrollment_student_session", "enrollments", ["student_id", "session_id"]
    )
    op.drop_constraint("ck_enrollment_dates", "enrollments", type_="check")
    op.drop_column("enrollments", "ended_on")
    op.drop_column("enrollments", "started_on")

    op.execute(
        """
        DELETE FROM student_attendance old
        USING student_attendance keep
        WHERE old.student_id = keep.student_id
          AND old.session_id = keep.session_id
          AND old.attendance_date = keep.attendance_date
          AND (old.marked_at < keep.marked_at
               OR (old.marked_at = keep.marked_at AND old.id < keep.id))
        """
    )
    op.drop_index("uq_student_attendance_legacy_day", table_name="student_attendance")
    op.drop_constraint("uq_student_attendance_period", "student_attendance", type_="unique")
    op.drop_constraint(
        "ck_student_attendance_period_scope_complete", "student_attendance", type_="check"
    )
    op.create_unique_constraint(
        "uq_student_attendance_day",
        "student_attendance",
        ["student_id", "session_id", "attendance_date"],
    )
    op.drop_index(op.f("ix_student_attendance_timetable_slot_id"), table_name="student_attendance")
    op.drop_index(op.f("ix_student_attendance_course_id"), table_name="student_attendance")
    op.drop_constraint("fk_student_attendance_timetable_slot", "student_attendance", type_="foreignkey")
    op.drop_constraint("fk_student_attendance_course", "student_attendance", type_="foreignkey")
    op.drop_column("student_attendance", "timetable_slot_id")
    op.drop_column("student_attendance", "course_id")
