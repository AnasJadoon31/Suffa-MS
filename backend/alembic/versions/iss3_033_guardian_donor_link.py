"""Add guardian is_donor flag and donor guardian_id link

Revision ID: iss3_033_guardian_donor_link
Revises: iss3_032_program_portal
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "iss3_033_guardian_donor_link"
down_revision: Union[str, None] = "iss3_032_program_portal"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("guardians", sa.Column("is_donor", sa.Boolean(), server_default=sa.text("false"), nullable=False))
    op.add_column("donors", sa.Column("guardian_id", sa.UUID(), nullable=True))
    op.create_index(op.f("ix_donors_guardian_id"), "donors", ["guardian_id"], unique=False)
    op.create_foreign_key(op.f("fk_donors_guardian_id_guardians"), "donors", "guardians", ["guardian_id"], ["id"])


def downgrade() -> None:
    op.drop_constraint(op.f("fk_donors_guardian_id_guardians"), "donors", type_="foreignkey")
    op.drop_index(op.f("ix_donors_guardian_id"), table_name="donors")
    op.drop_column("donors", "guardian_id")
    op.drop_column("guardians", "is_donor")
