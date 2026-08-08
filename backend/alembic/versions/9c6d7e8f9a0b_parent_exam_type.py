"""add parent_exam_type_id to exam_types

Revision ID: 9c6d7e8f9a0b
Revises: 8b5c6d7e8f9a
Create Date: 2026-08-05

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "9c6d7e8f9a0b"
down_revision: Union[str, None] = "8b5c6d7e8f9a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("exam_types", sa.Column("parent_exam_type_id", postgresql.UUID(), nullable=True))
    op.create_foreign_key("fk_exam_types_parent", "exam_types", "exam_types", ["parent_exam_type_id"], ["id"])
    op.create_index(op.f("ix_exam_types_parent_exam_type_id"), "exam_types", ["parent_exam_type_id"])


def downgrade() -> None:
    op.drop_index(op.f("ix_exam_types_parent_exam_type_id"), "exam_types")
    op.drop_constraint("fk_exam_types_parent", "exam_types", type_="foreignkey")
    op.drop_column("exam_types", "parent_exam_type_id")
