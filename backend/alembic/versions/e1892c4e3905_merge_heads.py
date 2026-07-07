"""merge heads

Revision ID: e1892c4e3905
Revises: b12d5e8a9f31, d59f7b2a3e84
Create Date: 2026-07-06 17:53:16.663166

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e1892c4e3905'
down_revision: Union[str, None] = ('b12d5e8a9f31', 'd59f7b2a3e84')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
