"""Enforce one normalized course name per madrasa.

Revision ID: 7a2f1c9d4e60
Revises: 6f41c8a2d9b0
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "7a2f1c9d4e60"
down_revision: str | None = "6f41c8a2d9b0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Existing duplicates need operator review because blindly deleting one
    # can orphan timetable, assessment, and class-course relationships.
    duplicates = op.get_bind().exec_driver_sql(
        """
        SELECT madrasa_id, lower(trim(name)) AS normalized_name, count(*)
        FROM courses
        GROUP BY madrasa_id, lower(trim(name))
        HAVING count(*) > 1
        """
    ).fetchall()
    if duplicates:
        raise RuntimeError(
            "Duplicate course names must be merged before migration: "
            + ", ".join(f"{row[0]}:{row[1]} ({row[2]})" for row in duplicates)
        )
    op.create_index(
        "uq_course_madrasa_normalized_name",
        "courses",
        ["madrasa_id", sa.text("lower(trim(name))")],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("uq_course_madrasa_normalized_name", table_name="courses")
