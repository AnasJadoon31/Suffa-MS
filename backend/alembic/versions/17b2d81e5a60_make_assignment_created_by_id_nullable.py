"""make assignment created_by_id nullable

Revision ID: 17b2d81e5a60
Revises: 81b22a6317cf
Create Date: 2026-07-07 11:20:53.091028

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '17b2d81e5a60'
down_revision: Union[str, None] = '81b22a6317cf'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Same issue as marks.entered_by_id: non-teacher staff (Principal) can
    # hold assignments.create but have no teacher_profiles row.
    op.alter_column("assignments", "created_by_id", nullable=True)


def downgrade() -> None:
    op.alter_column("assignments", "created_by_id", nullable=False)
