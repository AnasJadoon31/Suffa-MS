"""add profile phone lists

Revision ID: 32502fc5c5d0
Revises: 9c6d7e8f9a0b
Create Date: 2026-08-10 21:58:50.132013

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '32502fc5c5d0'
down_revision: Union[str, None] = '9c6d7e8f9a0b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    for table in ("teacher_profiles", "student_profiles", "guardians", "donors"):
        op.add_column(table, sa.Column("phone_list", sa.JSON(), nullable=False, server_default="[]"))
        op.add_column(table, sa.Column("default_phone_number", sa.String(length=32), nullable=True))

    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("UPDATE teacher_profiles SET phone_list = jsonb_build_array(whatsapp_number), default_phone_number = whatsapp_number WHERE whatsapp_number IS NOT NULL AND whatsapp_number <> ''")
        op.execute("UPDATE student_profiles SET phone_list = jsonb_build_array(phone), default_phone_number = phone WHERE phone IS NOT NULL AND phone <> ''")
        op.execute("UPDATE guardians SET phone_list = jsonb_build_array(phone_numbers), default_phone_number = split_part(phone_numbers, ',', 1) WHERE phone_numbers IS NOT NULL AND phone_numbers <> ''")
        op.execute("UPDATE donors SET phone_list = jsonb_build_array(contact), default_phone_number = contact WHERE contact IS NOT NULL AND contact <> ''")
    op.alter_column("teacher_profiles", "phone_list", server_default=None)
    op.alter_column("student_profiles", "phone_list", server_default=None)
    op.alter_column("guardians", "phone_list", server_default=None)
    op.alter_column("donors", "phone_list", server_default=None)


def downgrade() -> None:
    for table in ("donors", "guardians", "student_profiles", "teacher_profiles"):
        op.drop_column(table, "default_phone_number")
        op.drop_column(table, "phone_list")
