"""assignments: category, section_id, batch_id (§5 redesign)

Revision ID: d8f4a6b2c953
Revises: c3d8e1f5a927
Create Date: 2026-07-12

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "d8f4a6b2c953"
down_revision: Union[str, None] = "c3d8e1f5a927"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("assignments", sa.Column("section_id", sa.Uuid(), nullable=True))
    op.add_column("assignments", sa.Column("category", sa.String(length=60), nullable=True))
    op.add_column("assignments", sa.Column("batch_id", sa.Uuid(), nullable=True))
    op.create_foreign_key(
        "fk_assignments_section", "assignments", "sections", ["section_id"], ["id"]
    )
    op.create_index(op.f("ix_assignments_section_id"), "assignments", ["section_id"])
    op.create_index(op.f("ix_assignments_batch_id"), "assignments", ["batch_id"])


def downgrade() -> None:
    op.drop_index(op.f("ix_assignments_batch_id"), table_name="assignments")
    op.drop_index(op.f("ix_assignments_section_id"), table_name="assignments")
    op.drop_constraint("fk_assignments_section", "assignments", type_="foreignkey")
    op.drop_column("assignments", "batch_id")
    op.drop_column("assignments", "category")
    op.drop_column("assignments", "section_id")
