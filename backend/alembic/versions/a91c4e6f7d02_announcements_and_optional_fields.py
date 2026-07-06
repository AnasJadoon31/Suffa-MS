"""add announcements table; relax resources/forms optional columns

Revision ID: a91c4e6f7d02
Revises: f3a7c9d21b06
Create Date: 2026-07-06

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "a91c4e6f7d02"
down_revision: Union[str, None] = "f3a7c9d21b06"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "announcements",
        sa.Column("title", sa.String(length=160), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("attachment_link", sa.String(length=500), nullable=True),
        sa.Column("audience_scope", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("publish_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by_id", sa.Uuid(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("madrasa_id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["madrasa_id"], ["madaris.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_announcements_madrasa_id"), "announcements", ["madrasa_id"], unique=False)

    op.alter_column("resources", "description", existing_type=sa.Text(), nullable=True)
    op.alter_column("resources", "file_key", existing_type=sa.String(length=255), nullable=True)
    op.alter_column("resources", "video_url", existing_type=sa.String(length=255), nullable=True)
    op.alter_column("forms", "open_from", existing_type=sa.DateTime(timezone=True), nullable=True)
    op.alter_column("forms", "open_until", existing_type=sa.DateTime(timezone=True), nullable=True)


def downgrade() -> None:
    op.alter_column("forms", "open_until", existing_type=sa.DateTime(timezone=True), nullable=False)
    op.alter_column("forms", "open_from", existing_type=sa.DateTime(timezone=True), nullable=False)
    op.alter_column("resources", "video_url", existing_type=sa.String(length=255), nullable=False)
    op.alter_column("resources", "file_key", existing_type=sa.String(length=255), nullable=False)
    op.alter_column("resources", "description", existing_type=sa.Text(), nullable=False)

    op.drop_index(op.f("ix_announcements_madrasa_id"), table_name="announcements")
    op.drop_table("announcements")
