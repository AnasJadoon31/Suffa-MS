"""add program_courses table

Revision ID: 6f3a9f1c5e38
Revises: 5e2f8e0b4d26
Create Date: 2026-08-04

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "6f3a9f1c5e38"
down_revision: Union[str, None] = "5e2f8e0b4d26"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "program_courses",
        sa.Column("id", sa.dialects.postgresql.UUID(), nullable=False),
        sa.Column("madrasa_id", sa.dialects.postgresql.UUID(), nullable=False),
        sa.Column("program_id", sa.dialects.postgresql.UUID(), nullable=False),
        sa.Column("course_id", sa.dialects.postgresql.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["madrasa_id"], ["madaris.id"]),
        sa.ForeignKeyConstraint(["program_id"], ["programs.id"]),
        sa.ForeignKeyConstraint(["course_id"], ["courses.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("program_id", "course_id", name="uq_program_course"),
    )
    op.create_index(op.f("ix_program_courses_course_id"), "program_courses", ["course_id"])
    op.create_index(op.f("ix_program_courses_program_id"), "program_courses", ["program_id"])


def downgrade() -> None:
    op.drop_table("program_courses")
