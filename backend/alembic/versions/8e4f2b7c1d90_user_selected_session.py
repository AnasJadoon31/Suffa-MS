"""add users.selected_session_id (per-user academic-session context)

Revision ID: 8e4f2b7c1d90
Revises: 4b016bf285d3
Create Date: 2026-07-11

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "8e4f2b7c1d90"
down_revision: Union[str, None] = "4b016bf285d3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("selected_session_id", sa.Uuid(), nullable=True),
    )
    op.create_foreign_key(
        "fk_users_selected_session",
        "users",
        "academic_sessions",
        ["selected_session_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_users_selected_session", "users", type_="foreignkey")
    op.drop_column("users", "selected_session_id")
