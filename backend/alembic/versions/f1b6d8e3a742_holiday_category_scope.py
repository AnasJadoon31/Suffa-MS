"""holidays: category + class scoping (B4)

Revision ID: f1b6d8e3a742
Revises: e5a1c7d9b304
Create Date: 2026-07-12

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "f1b6d8e3a742"
down_revision: Union[str, None] = "e5a1c7d9b304"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("holidays", sa.Column("category", sa.String(length=60), nullable=True))
    op.add_column(
        "holidays",
        sa.Column("class_ids", sa.JSON().with_variant(JSONB(), "postgresql"), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("holidays", "class_ids")
    op.drop_column("holidays", "category")
