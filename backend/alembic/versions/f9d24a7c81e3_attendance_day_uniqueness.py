"""attendance day uniqueness

One attendance row per (subject, session, day). Existing duplicates —
produced by the old sync path that deduped only on idempotency_key —
are collapsed to the most recent mark before the constraint is added.

Revision ID: f9d24a7c81e3
Revises: 17b2d81e5a60
Create Date: 2026-07-09

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f9d24a7c81e3'
down_revision: Union[str, None] = '17b2d81e5a60'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

DEDUPE_SQL = """
DELETE FROM {table} a
USING {table} b
WHERE a.{subject} = b.{subject}
  AND a.session_id = b.session_id
  AND a.attendance_date = b.attendance_date
  AND (a.marked_at < b.marked_at
       OR (a.marked_at = b.marked_at AND a.id < b.id))
"""


def upgrade() -> None:
    op.execute(DEDUPE_SQL.format(table="student_attendance", subject="student_id"))
    op.execute(DEDUPE_SQL.format(table="teacher_attendance", subject="teacher_id"))
    op.create_unique_constraint(
        "uq_student_attendance_day", "student_attendance", ["student_id", "session_id", "attendance_date"]
    )
    op.create_unique_constraint(
        "uq_teacher_attendance_day", "teacher_attendance", ["teacher_id", "session_id", "attendance_date"]
    )


def downgrade() -> None:
    op.drop_constraint("uq_teacher_attendance_day", "teacher_attendance", type_="unique")
    op.drop_constraint("uq_student_attendance_day", "student_attendance", type_="unique")
