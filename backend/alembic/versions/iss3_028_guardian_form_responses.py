"""Retain guardian respondent and ward context on form responses.

Revision ID: iss3_028_guardian_forms
Revises: iss3_019_identity_phone
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "iss3_028_guardian_forms"
down_revision: Union[str, None] = "iss3_019_identity_phone"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("form_responses", sa.Column("guardian_id", sa.UUID(), nullable=True))
    op.add_column("form_responses", sa.Column("ward_id", sa.UUID(), nullable=True))
    op.create_foreign_key(
        "fk_form_responses_guardian_id",
        "form_responses",
        "guardians",
        ["guardian_id"],
        ["id"],
    )
    op.create_foreign_key(
        "fk_form_responses_ward_id",
        "form_responses",
        "student_profiles",
        ["ward_id"],
        ["id"],
    )
    op.create_index("ix_form_responses_guardian_id", "form_responses", ["guardian_id"])
    op.create_index("ix_form_responses_ward_id", "form_responses", ["ward_id"])


def downgrade() -> None:
    op.drop_index("ix_form_responses_ward_id", table_name="form_responses")
    op.drop_index("ix_form_responses_guardian_id", table_name="form_responses")
    op.drop_constraint("fk_form_responses_ward_id", "form_responses", type_="foreignkey")
    op.drop_constraint("fk_form_responses_guardian_id", "form_responses", type_="foreignkey")
    op.drop_column("form_responses", "ward_id")
    op.drop_column("form_responses", "guardian_id")
