"""add blog_posts and admission_applications tables

Revision ID: c48e6a1f9d73
Revises: a91c4e6f7d02
Create Date: 2026-07-06

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c48e6a1f9d73"
down_revision: Union[str, None] = "a91c4e6f7d02"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "blog_posts",
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("published", sa.Boolean(), nullable=False),
        sa.Column("publish_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("author_id", sa.Uuid(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("madrasa_id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["author_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["madrasa_id"], ["madaris.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_blog_posts_madrasa_id"), "blog_posts", ["madrasa_id"], unique=False)

    op.create_table(
        "admission_applications",
        sa.Column("applicant_name", sa.String(length=160), nullable=False),
        sa.Column("guardian_contact", sa.String(length=60), nullable=False),
        sa.Column("program_id", sa.Uuid(), nullable=True),
        sa.Column("date_of_birth", sa.Date(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=24), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("madrasa_id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["program_id"], ["programs.id"]),
        sa.ForeignKeyConstraint(["madrasa_id"], ["madaris.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_admission_applications_madrasa_id"), "admission_applications", ["madrasa_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_admission_applications_madrasa_id"), table_name="admission_applications")
    op.drop_table("admission_applications")
    op.drop_index(op.f("ix_blog_posts_madrasa_id"), table_name="blog_posts")
    op.drop_table("blog_posts")
