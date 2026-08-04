"""add donor user_id and login support

Revision ID: 4d1f7e9a3c25
Revises: f9d24a7c81e3
Create Date: 2026-08-04

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "4d1f7e9a3c25"
down_revision: Union[str, None] = "iss3_028_guardian_forms"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("donors", sa.Column("user_id", sa.dialects.postgresql.UUID(), nullable=True))
    op.create_foreign_key(
        "fk_donors_user_id_users",
        "donors",
        "users",
        ["user_id"],
        ["id"],
    )


def downgrade() -> None:
    op.drop_constraint("fk_donors_user_id_users", "donors", type_="foreignkey")
    op.drop_column("donors", "user_id")
