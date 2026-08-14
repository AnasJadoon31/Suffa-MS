"""Merge heads: program courses + user name/guardian-donor status

Revision ID: iss3_031_merge_heads
Revises: 7c2d19b9a50e, iss3_030_guardian_donor_status
"""

from typing import Sequence, Union

from alembic import op


revision: str = "iss3_031_merge_heads"
down_revision: Union[str, None, tuple] = ("7c2d19b9a50e", "iss3_030_guardian_donor_status")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
