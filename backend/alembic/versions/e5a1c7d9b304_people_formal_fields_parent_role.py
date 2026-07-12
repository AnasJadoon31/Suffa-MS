"""parent role, guardian logins, formal profile fields (§11 / B7-k)

Revision ID: e5a1c7d9b304
Revises: d8f4a6b2c953
Create Date: 2026-07-12

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "e5a1c7d9b304"
down_revision: Union[str, None] = "d8f4a6b2c953"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'parent'")

    op.add_column("teacher_profiles", sa.Column("cnic", sa.String(length=20), nullable=True))
    op.add_column("teacher_profiles", sa.Column("address", sa.Text(), nullable=True))
    op.add_column("teacher_profiles", sa.Column("emergency_contact", sa.String(length=160), nullable=True))
    op.add_column("teacher_profiles", sa.Column("photo_file_id", sa.Uuid(), nullable=True))
    op.create_foreign_key(
        "fk_teacher_profiles_photo", "teacher_profiles", "file_objects", ["photo_file_id"], ["id"]
    )

    op.add_column("student_profiles", sa.Column("b_form_number", sa.String(length=20), nullable=True))
    op.add_column("student_profiles", sa.Column("address", sa.Text(), nullable=True))
    op.add_column("student_profiles", sa.Column("photo_file_id", sa.Uuid(), nullable=True))
    op.create_foreign_key(
        "fk_student_profiles_photo", "student_profiles", "file_objects", ["photo_file_id"], ["id"]
    )

    op.add_column("guardians", sa.Column("user_id", sa.Uuid(), nullable=True))
    op.add_column("guardians", sa.Column("cnic", sa.String(length=20), nullable=True))
    op.add_column("guardians", sa.Column("address", sa.Text(), nullable=True))
    op.create_foreign_key("fk_guardians_user", "guardians", "users", ["user_id"], ["id"])


def downgrade() -> None:
    op.drop_constraint("fk_guardians_user", "guardians", type_="foreignkey")
    op.drop_column("guardians", "address")
    op.drop_column("guardians", "cnic")
    op.drop_column("guardians", "user_id")

    op.drop_constraint("fk_student_profiles_photo", "student_profiles", type_="foreignkey")
    op.drop_column("student_profiles", "photo_file_id")
    op.drop_column("student_profiles", "address")
    op.drop_column("student_profiles", "b_form_number")

    op.drop_constraint("fk_teacher_profiles_photo", "teacher_profiles", type_="foreignkey")
    op.drop_column("teacher_profiles", "photo_file_id")
    op.drop_column("teacher_profiles", "emergency_contact")
    op.drop_column("teacher_profiles", "address")
    op.drop_column("teacher_profiles", "cnic")
    # 'parent' enum value stays (Postgres cannot drop enum values).
