"""assignment target students, optional attachment, result publications

Revision ID: b12d5e8a9f31
Revises: a91c4e6f7d02
Create Date: 2026-07-06

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "b12d5e8a9f31"
down_revision: Union[str, None] = "a91c4e6f7d02"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column("assignments", "attachment_key", existing_type=sa.String(length=255), nullable=True)
    op.add_column("assignments", sa.Column("target_student_ids", postgresql.JSONB(astext_type=sa.Text()), nullable=True))

    op.create_unique_constraint("uq_mark_exam_student", "marks", ["exam_type_id", "student_id"])

    op.create_table(
        "result_publications",
        sa.Column("student_id", sa.Uuid(), nullable=False),
        sa.Column("session_id", sa.Uuid(), nullable=False),
        sa.Column("published_by_id", sa.Uuid(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("madrasa_id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["madrasa_id"], ["madaris.id"]),
        sa.ForeignKeyConstraint(["published_by_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["session_id"], ["academic_sessions.id"]),
        sa.ForeignKeyConstraint(["student_id"], ["student_profiles.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("student_id", "session_id", name="uq_publication_student_session"),
    )
    op.create_index(op.f("ix_result_publications_madrasa_id"), "result_publications", ["madrasa_id"], unique=False)
    op.create_index(op.f("ix_result_publications_session_id"), "result_publications", ["session_id"], unique=False)
    op.create_index(op.f("ix_result_publications_student_id"), "result_publications", ["student_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_result_publications_student_id"), table_name="result_publications")
    op.drop_index(op.f("ix_result_publications_session_id"), table_name="result_publications")
    op.drop_index(op.f("ix_result_publications_madrasa_id"), table_name="result_publications")
    op.drop_table("result_publications")

    op.drop_constraint("uq_mark_exam_student", "marks", type_="unique")

    op.drop_column("assignments", "target_student_ids")
    op.alter_column("assignments", "attachment_key", existing_type=sa.String(length=255), nullable=False)
