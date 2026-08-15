"""Add default_portal_enabled to programs

Revision ID: iss3_032_program_portal
Revises: iss3_031_merge_heads
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "iss3_032_program_portal"
down_revision: Union[str, None] = "iss3_031_merge_heads"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("programs", sa.Column("default_portal_enabled", sa.Boolean(), server_default=sa.text("true"), nullable=False))


def downgrade() -> None:
    op.drop_column("programs", "default_portal_enabled")
