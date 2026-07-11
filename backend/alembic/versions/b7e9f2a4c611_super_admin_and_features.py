"""super_admin role, nullable users.madrasa_id, madrasa_features table

Revision ID: b7e9f2a4c611
Revises: 9a1c5d3e7f42
Create Date: 2026-07-12

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "b7e9f2a4c611"
down_revision: Union[str, None] = "9a1c5d3e7f42"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Postgres 12+ allows ADD VALUE inside a transaction as long as the enum
    # type wasn't created in the same transaction.
    op.execute("ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'super_admin'")

    op.alter_column("users", "madrasa_id", existing_type=sa.Uuid(), nullable=True)

    op.create_table(
        "madrasa_features",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("madrasa_id", sa.Uuid(), nullable=False),
        sa.Column("feature_key", sa.String(length=40), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.Column("set_by_id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["madrasa_id"], ["madaris.id"]),
        sa.ForeignKeyConstraint(["set_by_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("madrasa_id", "feature_key", name="uq_madrasa_feature"),
    )
    op.create_index(op.f("ix_madrasa_features_madrasa_id"), "madrasa_features", ["madrasa_id"])


def downgrade() -> None:
    op.drop_index(op.f("ix_madrasa_features_madrasa_id"), table_name="madrasa_features")
    op.drop_table("madrasa_features")
    op.alter_column("users", "madrasa_id", existing_type=sa.Uuid(), nullable=False)
    # Postgres cannot remove an enum value; leaving 'super_admin' in place is
    # harmless for a downgraded schema.
