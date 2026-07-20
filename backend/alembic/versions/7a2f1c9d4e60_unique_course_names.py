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
    bind = op.get_bind()
    duplicate_groups = bind.exec_driver_sql(
        """
        SELECT
            madrasa_id,
            lower(trim(name)) AS normalized_name,
            array_agg(id ORDER BY created_at, id) AS course_ids
        FROM courses
        GROUP BY madrasa_id, lower(trim(name))
        HAVING count(*) > 1
        """
    ).fetchall()

    # Legacy installations may already contain duplicates. Keep the oldest
    # course as the canonical row and repoint every dependent record before
    # enforcing uniqueness. class_courses needs special handling because it
    # already has a unique (class_id, course_id) constraint.
    for _madrasa_id, _normalized_name, course_ids in duplicate_groups:
        canonical_id, *duplicate_ids = course_ids
        parameters = {"canonical_id": canonical_id, "duplicate_ids": duplicate_ids}

        bind.execute(
            sa.text(
                """
                WITH ranked_mappings AS (
                    SELECT
                        id,
                        row_number() OVER (
                            PARTITION BY class_id
                            ORDER BY CASE WHEN course_id = :canonical_id THEN 0 ELSE 1 END, created_at, id
                        ) AS position
                    FROM class_courses
                    WHERE course_id = :canonical_id OR course_id IN :duplicate_ids
                )
                DELETE FROM class_courses AS mapping
                USING ranked_mappings AS ranked
                WHERE mapping.id = ranked.id AND ranked.position > 1
                """
            ).bindparams(sa.bindparam("duplicate_ids", expanding=True)),
            parameters,
        )
        bind.execute(
            sa.text(
                "UPDATE class_courses SET course_id = :canonical_id WHERE course_id IN :duplicate_ids"
            ).bindparams(sa.bindparam("duplicate_ids", expanding=True)),
            parameters,
        )
        for table in ("teacher_assignments", "timetable_slots", "assignments", "exam_types"):
            bind.execute(
                sa.text(
                    f"UPDATE {table} SET course_id = :canonical_id WHERE course_id IN :duplicate_ids"
                ).bindparams(sa.bindparam("duplicate_ids", expanding=True)),
                parameters,
            )
        bind.execute(
            sa.text("DELETE FROM courses WHERE id IN :duplicate_ids").bindparams(
                sa.bindparam("duplicate_ids", expanding=True)
            ),
            parameters,
        )

    op.create_index(
        "uq_course_madrasa_normalized_name",
        "courses",
        ["madrasa_id", sa.text("lower(trim(name))")],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("uq_course_madrasa_normalized_name", table_name="courses")
