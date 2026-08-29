"""widen_student_attendance_idempotency_key

Revision ID: c10d1c28657f
Revises: e1fe6e517f95
Create Date: 2026-08-29 10:15:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'c10d1c28657f'
down_revision: Union[str, None] = 'e1fe6e517f95'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # student_attendance.idempotency_key packs three UUIDs + a date + three
    # colons (121 chars) when a real timetable period is scheduled — one
    # over the original 120-char column, which threw an unhandled
    # StringDataRightTruncationError on every scoped attendance sync/save.
    op.alter_column(
        'student_attendance',
        'idempotency_key',
        existing_type=sa.String(length=120),
        type_=sa.String(length=160),
        existing_nullable=False,
    )


def downgrade() -> None:
    op.alter_column(
        'student_attendance',
        'idempotency_key',
        existing_type=sa.String(length=160),
        type_=sa.String(length=120),
        existing_nullable=False,
    )
