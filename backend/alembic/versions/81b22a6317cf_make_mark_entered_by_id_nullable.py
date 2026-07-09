"""make mark entered_by_id nullable

Revision ID: 81b22a6317cf
Revises: 1c56ea01e47c
Create Date: 2026-07-07 09:34:44.059649

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '81b22a6317cf'
down_revision: Union[str, None] = '1c56ea01e47c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Non-teacher staff (e.g. Principal) can also hold assessments.marks.enter;
    # they have no teacher_profiles row to satisfy the old NOT NULL FK.
    op.alter_column("marks", "entered_by_id", nullable=True)


def downgrade() -> None:
    op.alter_column("marks", "entered_by_id", nullable=False)
