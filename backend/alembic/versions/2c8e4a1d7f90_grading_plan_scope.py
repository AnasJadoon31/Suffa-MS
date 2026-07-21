"""Add aggregate grading-plan scope and assignment pool weight.

Revision ID: 2c8e4a1d7f90
Revises: 2f4a8c1d9e70
Create Date: 2026-07-22
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "2c8e4a1d7f90"
down_revision: Union[str, None] = "2f4a8c1d9e70"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("grading_schemes", sa.Column("course_id", sa.Uuid(), nullable=True))
    op.add_column("grading_schemes", sa.Column("class_id", sa.Uuid(), nullable=True))
    op.add_column("grading_schemes", sa.Column("assignment_weightage", sa.Float(), nullable=True))
    op.create_foreign_key(
        "fk_grading_schemes_course_id_courses", "grading_schemes", "courses", ["course_id"], ["id"]
    )
    op.create_foreign_key(
        "fk_grading_schemes_class_id_classes", "grading_schemes", "classes", ["class_id"], ["id"]
    )
    op.create_index("ix_grading_schemes_course_id", "grading_schemes", ["course_id"])
    op.create_index("ix_grading_schemes_class_id", "grading_schemes", ["class_id"])
    op.create_index(
        "uq_grading_plan_course_default",
        "grading_schemes",
        ["madrasa_id", "course_id"],
        unique=True,
        postgresql_where=sa.text("course_id IS NOT NULL AND class_id IS NULL"),
    )
    op.create_index(
        "uq_grading_plan_class_override",
        "grading_schemes",
        ["madrasa_id", "course_id", "class_id"],
        unique=True,
        postgresql_where=sa.text("course_id IS NOT NULL AND class_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_grading_plan_class_override", table_name="grading_schemes")
    op.drop_index("uq_grading_plan_course_default", table_name="grading_schemes")
    op.drop_index("ix_grading_schemes_class_id", table_name="grading_schemes")
    op.drop_index("ix_grading_schemes_course_id", table_name="grading_schemes")
    op.drop_constraint("fk_grading_schemes_class_id_classes", "grading_schemes", type_="foreignkey")
    op.drop_constraint("fk_grading_schemes_course_id_courses", "grading_schemes", type_="foreignkey")
    op.drop_column("grading_schemes", "assignment_weightage")
    op.drop_column("grading_schemes", "class_id")
    op.drop_column("grading_schemes", "course_id")
