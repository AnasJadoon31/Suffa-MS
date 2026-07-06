"""add portal_enabled to student_profiles

Revision ID: f3a7c9d21b06
Revises: d74c9c7a4b64
Create Date: 2026-07-04

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "f3a7c9d21b06"
down_revision: Union[str, None] = "d74c9c7a4b64"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "student_profiles",
        sa.Column("portal_enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    op.alter_column("student_profiles", "portal_enabled", server_default=None)


def downgrade() -> None:
    op.drop_column("student_profiles", "portal_enabled")
