"""add scope_type/scope_id to user_permissions (mini-admin delegation)

Revision ID: 9a1c5d3e7f42
Revises: 8e4f2b7c1d90
Create Date: 2026-07-11

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "9a1c5d3e7f42"
down_revision: Union[str, None] = "8e4f2b7c1d90"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("user_permissions", sa.Column("scope_type", sa.String(length=20), nullable=True))
    op.add_column("user_permissions", sa.Column("scope_id", sa.Uuid(), nullable=True))


def downgrade() -> None:
    op.drop_column("user_permissions", "scope_id")
    op.drop_column("user_permissions", "scope_type")
