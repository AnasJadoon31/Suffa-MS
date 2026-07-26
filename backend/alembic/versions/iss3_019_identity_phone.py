"""Tenant identity constraints and canonical student phone fields.

Revision ID: iss3_019_identity_phone
Revises: iss3_012_guardian_links
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "iss3_019_identity_phone"
down_revision: Union[str, None] = "iss3_012_guardian_links"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _constraint_exists(table_name: str, constraint_name: str) -> bool:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return False
    return bool(
        bind.execute(
            sa.text(
                """
                SELECT 1
                FROM pg_constraint constraint_row
                JOIN pg_class table_row ON table_row.oid = constraint_row.conrelid
                WHERE table_row.relname = :table_name
                  AND constraint_row.conname = :constraint_name
                """
            ),
            {"table_name": table_name, "constraint_name": constraint_name},
        ).scalar()
    )


def _drop_unique_constraint_if_exists(table_name: str, constraint_name: str) -> None:
    if _constraint_exists(table_name, constraint_name):
        op.drop_constraint(constraint_name, table_name, type_="unique")


def _create_unique_constraint_if_missing(
    constraint_name: str, table_name: str, columns: list[str]
) -> None:
    if not _constraint_exists(table_name, constraint_name):
        op.create_unique_constraint(constraint_name, table_name, columns)


def upgrade() -> None:
    _drop_unique_constraint_if_exists("users", "users_username_key")
    _create_unique_constraint_if_missing(
        "uq_user_username_tenant",
        "users",
        ["madrasa_id", "username"],
    )

    _drop_unique_constraint_if_exists(
        "student_profiles",
        "student_profiles_admission_number_key",
    )
    _create_unique_constraint_if_missing(
        "uq_student_admission_number_tenant",
        "student_profiles",
        ["madrasa_id", "admission_number"],
    )

    op.add_column("student_profiles", sa.Column("phone", sa.String(32), nullable=True))
    op.add_column(
        "student_profiles",
        sa.Column(
            "is_independent",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )

    # Normalize values that unambiguously match a Pakistan mobile number.
    # Invalid legacy data is deliberately retained for the dry-run report and
    # manual correction instead of being silently truncated.
    for table_name, column_name in (
        ("teacher_profiles", "whatsapp_number"),
        ("guardians", "phone_numbers"),
        ("admission_applications", "guardian_contact"),
    ):
        op.execute(
            sa.text(
                f"""
                UPDATE {table_name}
                SET {column_name} =
                    CASE
                        WHEN regexp_replace({column_name}, '[^0-9]', '', 'g') LIKE '92%'
                            THEN '+' || regexp_replace({column_name}, '[^0-9]', '', 'g')
                        WHEN regexp_replace({column_name}, '[^0-9]', '', 'g') LIKE '03%'
                            THEN '+92' || substring(regexp_replace({column_name}, '[^0-9]', '', 'g') FROM 2)
                        WHEN regexp_replace({column_name}, '[^0-9]', '', 'g') LIKE '3%'
                            THEN '+92' || regexp_replace({column_name}, '[^0-9]', '', 'g')
                        ELSE {column_name}
                    END
                WHERE length(regexp_replace({column_name}, '[^0-9]', '', 'g')) IN (10, 11, 12)
                """
            )
        )


def downgrade() -> None:
    op.drop_column("student_profiles", "is_independent")
    op.drop_column("student_profiles", "phone")

    _drop_unique_constraint_if_exists(
        "student_profiles",
        "uq_student_admission_number_tenant",
    )
    _create_unique_constraint_if_missing(
        "student_profiles_admission_number_key",
        "student_profiles",
        ["admission_number"],
    )

    _drop_unique_constraint_if_exists("users", "uq_user_username_tenant")
    _create_unique_constraint_if_missing("users_username_key", "users", ["username"])
