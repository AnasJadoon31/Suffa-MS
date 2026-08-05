"""add permission_roles, permission_role_grants, user_role_assignments

Revision ID: 7a4b5c6d7e8f
Revises: 6f3a9f1c5e38
Create Date: 2026-08-05

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "7a4b5c6d7e8f"
down_revision: Union[str, None] = "6f3a9f1c5e38"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "permission_roles",
        sa.Column("id", sa.dialects.postgresql.UUID(), nullable=False),
        sa.Column("madrasa_id", sa.dialects.postgresql.UUID(), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["madrasa_id"], ["madaris.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "permission_role_grants",
        sa.Column("id", sa.dialects.postgresql.UUID(), nullable=False),
        sa.Column("role_id", sa.dialects.postgresql.UUID(), nullable=False),
        sa.Column("permission_code", sa.String(120), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["role_id"], ["permission_roles.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("role_id", "permission_code", name="uq_role_grant"),
    )
    op.create_index(op.f("ix_permission_role_grants_role_id"), "permission_role_grants", ["role_id"])

    op.create_table(
        "user_role_assignments",
        sa.Column("id", sa.dialects.postgresql.UUID(), nullable=False),
        sa.Column("user_id", sa.dialects.postgresql.UUID(), nullable=False),
        sa.Column("role_id", sa.dialects.postgresql.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["role_id"], ["permission_roles.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "role_id", name="uq_user_role"),
    )
    op.create_index(op.f("ix_user_role_assignments_role_id"), "user_role_assignments", ["role_id"])
    op.create_index(op.f("ix_user_role_assignments_user_id"), "user_role_assignments", ["user_id"])


def downgrade() -> None:
    op.drop_table("user_role_assignments")
    op.drop_table("permission_role_grants")
    op.drop_table("permission_roles")
