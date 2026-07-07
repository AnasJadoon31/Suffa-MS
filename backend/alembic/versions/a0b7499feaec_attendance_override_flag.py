"""attendance override flag

Revision ID: a0b7499feaec
Revises: e1892c4e3905
Create Date: 2026-07-06 18:00:29.129182

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a0b7499feaec'
down_revision: Union[str, None] = 'e1892c4e3905'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("student_attendance", sa.Column("overridden", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("teacher_attendance", sa.Column("overridden", sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade() -> None:
    op.drop_column("teacher_attendance", "overridden")
    op.drop_column("student_attendance", "overridden")
