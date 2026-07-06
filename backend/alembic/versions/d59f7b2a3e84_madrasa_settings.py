"""add madrasa_settings table

Revision ID: d59f7b2a3e84
Revises: c48e6a1f9d73
Create Date: 2026-07-06

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "d59f7b2a3e84"
down_revision: Union[str, None] = "c48e6a1f9d73"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "madrasa_settings",
        sa.Column("key", sa.String(length=120), nullable=False),
        sa.Column("value", sa.Text(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("madrasa_id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["madrasa_id"], ["madaris.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("madrasa_id", "key", name="uq_setting_madrasa_key"),
    )
    op.create_index(op.f("ix_madrasa_settings_madrasa_id"), "madrasa_settings", ["madrasa_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_madrasa_settings_madrasa_id"), table_name="madrasa_settings")
    op.drop_table("madrasa_settings")
