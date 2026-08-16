"""Add daily report configs and entries

Revision ID: iss3_034_daily_reports
Revises: iss3_033_guardian_donor_link
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "iss3_034_daily_reports"
down_revision: Union[str, None] = "iss3_033_guardian_donor_link"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "daily_report_configs",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("madrasa_id", sa.UUID(), nullable=False),
        sa.Column("class_id", sa.UUID(), nullable=False),
        sa.Column("enabled", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("fields_definition", sa.JSON().with_variant(postgresql.JSONB(), "postgresql"), nullable=False, server_default=sa.text("'[]'")),
        sa.Column("slug", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["class_id"], ["classes.id"]),
        sa.ForeignKeyConstraint(["madrasa_id"], ["madaris.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("class_id", name="uq_daily_report_config_class"),
    )
    op.create_index(op.f("ix_daily_report_configs_class_id"), "daily_report_configs", ["class_id"], unique=False)
    op.create_index(op.f("ix_daily_report_configs_madrasa_id"), "daily_report_configs", ["madrasa_id"], unique=False)

    op.create_table(
        "daily_report_entries",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("madrasa_id", sa.UUID(), nullable=False),
        sa.Column("class_id", sa.UUID(), nullable=False),
        sa.Column("section_id", sa.UUID(), nullable=False),
        sa.Column("student_id", sa.UUID(), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("values", sa.JSON().with_variant(postgresql.JSONB(), "postgresql"), nullable=False, server_default=sa.text("'{}'")),
        sa.Column("created_by_id", sa.UUID(), nullable=False),
        sa.Column("updated_by_id", sa.UUID(), nullable=True),
        sa.Column("slug", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["class_id"], ["classes.id"]),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["madrasa_id"], ["madaris.id"]),
        sa.ForeignKeyConstraint(["section_id"], ["sections.id"]),
        sa.ForeignKeyConstraint(["student_id"], ["student_profiles.id"]),
        sa.ForeignKeyConstraint(["updated_by_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("class_id", "student_id", "date", name="uq_daily_report_entry"),
    )
    op.create_index(op.f("ix_daily_report_entries_class_id"), "daily_report_entries", ["class_id"], unique=False)
    op.create_index(op.f("ix_daily_report_entries_section_id"), "daily_report_entries", ["section_id"], unique=False)
    op.create_index(op.f("ix_daily_report_entries_student_id"), "daily_report_entries", ["student_id"], unique=False)
    op.create_index(op.f("ix_daily_report_entries_date"), "daily_report_entries", ["date"], unique=False)
    op.create_index("idx_daily_report_entry_date", "daily_report_entries", ["class_id", "date"], unique=False)


def downgrade() -> None:
    op.drop_index("idx_daily_report_entry_date", table_name="daily_report_entries")
    op.drop_index(op.f("ix_daily_report_entries_date"), table_name="daily_report_entries")
    op.drop_index(op.f("ix_daily_report_entries_student_id"), table_name="daily_report_entries")
    op.drop_index(op.f("ix_daily_report_entries_section_id"), table_name="daily_report_entries")
    op.drop_index(op.f("ix_daily_report_entries_class_id"), table_name="daily_report_entries")
    op.drop_table("daily_report_entries")

    op.drop_index(op.f("ix_daily_report_configs_madrasa_id"), table_name="daily_report_configs")
    op.drop_index(op.f("ix_daily_report_configs_class_id"), table_name="daily_report_configs")
    op.drop_table("daily_report_configs")
