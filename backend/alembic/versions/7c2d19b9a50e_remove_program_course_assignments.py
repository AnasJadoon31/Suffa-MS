"""move program courses onto classes

Revision ID: 7c2d19b9a50e
Revises: 4b13f91953ae
Create Date: 2026-08-11
"""
from datetime import datetime, timezone
from typing import Sequence, Union
from uuid import uuid4

from alembic import op
import sqlalchemy as sa


revision: str = "7c2d19b9a50e"
down_revision: Union[str, None] = "4b13f91953ae"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    links = bind.execute(
        sa.text("SELECT madrasa_id, program_id, course_id FROM program_courses")
    ).mappings()
    now = datetime.now(timezone.utc)
    for link in links:
        class_ids = bind.execute(
            sa.text("SELECT id FROM classes WHERE madrasa_id = :madrasa_id AND program_id = :program_id"),
            {"madrasa_id": link["madrasa_id"], "program_id": link["program_id"]},
        ).scalars()
        for class_id in class_ids:
            exists = bind.execute(
                sa.text("SELECT 1 FROM class_courses WHERE class_id = :class_id AND course_id = :course_id"),
                {"class_id": class_id, "course_id": link["course_id"]},
            ).scalar()
            if exists is None:
                bind.execute(
                    sa.text(
                        "INSERT INTO class_courses (id, madrasa_id, class_id, course_id, created_at, updated_at) "
                        "VALUES (:id, :madrasa_id, :class_id, :course_id, :created_at, :updated_at)"
                    ),
                    {
                        "id": uuid4(),
                        "madrasa_id": link["madrasa_id"],
                        "class_id": class_id,
                        "course_id": link["course_id"],
                        "created_at": now,
                        "updated_at": now,
                    },
                )
    op.drop_table("program_courses")


def downgrade() -> None:
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
