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


def upgrade() -> None:
    op.drop_constraint("users_username_key", "users", type_="unique")
    op.create_unique_constraint("uq_user_username_tenant", "users", ["madrasa_id", "username"])

    op.drop_constraint(
        "student_profiles_admission_number_key",
        "student_profiles",
        type_="unique",
    )
    op.create_unique_constraint(
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

    op.drop_constraint(
        "uq_student_admission_number_tenant",
        "student_profiles",
        type_="unique",
    )
    op.create_unique_constraint(
        "student_profiles_admission_number_key",
        "student_profiles",
        ["admission_number"],
    )

    op.drop_constraint("uq_user_username_tenant", "users", type_="unique")
    op.create_unique_constraint("users_username_key", "users", ["username"])
