"""make exam_types.course_id nullable

Revision ID: 8b5c6d7e8f9a
Revises: 7a4b5c6d7e8f
Create Date: 2026-08-05

"""
from typing import Sequence, Union
from alembic import op
from sqlalchemy.dialects import postgresql


revision: str = "8b5c6d7e8f9a"
down_revision: Union[str, None] = "7a4b5c6d7e8f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column("exam_types", "course_id", existing_type=postgresql.UUID(), nullable=True)


def downgrade() -> None:
    op.alter_column("exam_types", "course_id", existing_type=postgresql.UUID(), nullable=False)
