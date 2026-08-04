"""add donor to userrole enum

Revision ID: 5e2f8e0b4d26
Revises: 4d1f7e9a3c25
Create Date: 2026-08-04

"""
from typing import Sequence, Union

from alembic import op


revision: str = "5e2f8e0b4d26"
down_revision: Union[str, None] = "4d1f7e9a3c25"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'donor'")


def downgrade() -> None:
    pass
