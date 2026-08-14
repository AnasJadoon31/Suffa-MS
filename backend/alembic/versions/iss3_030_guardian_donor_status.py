"""Add status column to guardians and donors

Revision ID: iss3_030_guardian_donor_status
Revises: iss3_029_user_name
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "iss3_030_guardian_donor_status"
down_revision: Union[str, None] = "iss3_029_user_name"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("guardians", sa.Column("status", sa.String(length=24), server_default="active", nullable=False))
    op.add_column("donors", sa.Column("status", sa.String(length=24), server_default="active", nullable=False))


def downgrade() -> None:
    op.drop_column("donors", "status")
    op.drop_column("guardians", "status")
