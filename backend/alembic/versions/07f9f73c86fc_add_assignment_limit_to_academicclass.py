"""Add assignment limits and assignment grading option

Revision ID: 07f9f73c86fc
Revises: 9710ceddf791
Create Date: 2026-07-21 20:44:10.708167

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '07f9f73c86fc'
down_revision: Union[str, None] = '9710ceddf791'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('classes', sa.Column('assignment_limit', sa.Integer(), nullable=True))
    op.add_column('grading_schemes', sa.Column('include_assignments', sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade() -> None:
    op.drop_column('grading_schemes', 'include_assignments')
    op.drop_column('classes', 'assignment_limit')
