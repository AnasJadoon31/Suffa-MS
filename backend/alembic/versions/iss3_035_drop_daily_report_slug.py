"""Drop unused slug column from daily report tables

Revision ID: iss3_035_drop_daily_report_slug
Revises: iss3_034_daily_reports
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "iss3_035_drop_daily_report_slug"
down_revision: Union[str, None] = "iss3_034_daily_reports"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column("daily_report_entries", "slug")
    op.drop_column("daily_report_configs", "slug")


def downgrade() -> None:
    op.add_column("daily_report_configs", sa.Column("slug", sa.String(), nullable=False))
    op.add_column("daily_report_entries", sa.Column("slug", sa.String(), nullable=False))
