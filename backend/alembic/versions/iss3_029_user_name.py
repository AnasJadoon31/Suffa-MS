"""Add name column to users

Revision ID: iss3_029_user_name
Revises: iss3_028_guardian_forms
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "iss3_029_user_name"
down_revision: Union[str, None] = "iss3_028_guardian_forms"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("name", sa.String(length=160), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "name")
