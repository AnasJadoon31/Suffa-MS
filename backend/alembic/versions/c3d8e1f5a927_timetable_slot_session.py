"""timetable_slots.session_id + backfill from each madrasa's active session

Revision ID: c3d8e1f5a927
Revises: b7e9f2a4c611
Create Date: 2026-07-12

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c3d8e1f5a927"
down_revision: Union[str, None] = "b7e9f2a4c611"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("timetable_slots", sa.Column("session_id", sa.Uuid(), nullable=True))
    op.create_foreign_key(
        "fk_timetable_slots_session",
        "timetable_slots",
        "academic_sessions",
        ["session_id"],
        ["id"],
    )
    op.create_index(op.f("ix_timetable_slots_session_id"), "timetable_slots", ["session_id"])
    op.execute(
        """
        UPDATE timetable_slots
        SET session_id = (
            SELECT s.id FROM academic_sessions s
            WHERE s.madrasa_id = timetable_slots.madrasa_id AND s.is_active
        )
        WHERE session_id IS NULL
        """
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_timetable_slots_session_id"), table_name="timetable_slots")
    op.drop_constraint("fk_timetable_slots_session", "timetable_slots", type_="foreignkey")
    op.drop_column("timetable_slots", "session_id")
