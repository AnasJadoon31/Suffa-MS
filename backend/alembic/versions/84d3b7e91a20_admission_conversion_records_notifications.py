"""admission conversion records and administrator notifications

Revision ID: 84d3b7e91a20
Revises: 2c8e4a1d7f90
Create Date: 2026-07-22
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision: str = "84d3b7e91a20"
down_revision: str | None = "2c8e4a1d7f90"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


_TENANT_POLICY = """
    current_setting('app.is_super_admin', true) = 'true'
    OR madrasa_id = NULLIF(current_setting('app.current_madrasa_id', true), '')::uuid
"""


def _enable_tenant_rls(table_name: str) -> None:
    op.execute(f'ALTER TABLE "{table_name}" ENABLE ROW LEVEL SECURITY')
    op.execute(f'ALTER TABLE "{table_name}" FORCE ROW LEVEL SECURITY')
    op.execute(
        f'CREATE POLICY tenant_isolation ON "{table_name}" '
        f'FOR ALL USING ({_TENANT_POLICY}) WITH CHECK ({_TENANT_POLICY})'
    )


def upgrade() -> None:
    op.add_column(
        "admission_applications",
        sa.Column(
            "status_history",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
    )
    op.alter_column(
        "admission_applications",
        "status_history",
        existing_type=postgresql.JSONB(astext_type=sa.Text()),
        server_default=None,
    )
    op.add_column(
        "admission_applications",
        sa.Column("form_title_snapshot", sa.String(length=160), nullable=True),
    )
    op.add_column(
        "admission_applications",
        sa.Column(
            "fields_definition_snapshot",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
    )
    op.alter_column(
        "admission_applications",
        "fields_definition_snapshot",
        existing_type=postgresql.JSONB(astext_type=sa.Text()),
        server_default=None,
    )
    op.add_column(
        "admission_applications",
        sa.Column("converted_student_id", sa.Uuid(), nullable=True),
    )
    op.add_column(
        "admission_applications",
        sa.Column("converted_guardian_id", sa.Uuid(), nullable=True),
    )
    op.add_column(
        "admission_applications",
        sa.Column("converted_by_id", sa.Uuid(), nullable=True),
    )
    op.add_column(
        "admission_applications",
        sa.Column("converted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_admission_applications_converted_student",
        "admission_applications", "student_profiles", ["converted_student_id"], ["id"],
    )
    op.create_foreign_key(
        "fk_admission_applications_converted_guardian",
        "admission_applications", "guardians", ["converted_guardian_id"], ["id"],
    )
    op.create_foreign_key(
        "fk_admission_applications_converted_by",
        "admission_applications", "users", ["converted_by_id"], ["id"],
    )
    op.create_index(
        "ix_admission_applications_converted_student_id",
        "admission_applications", ["converted_student_id"], unique=True,
    )
    op.create_index(
        "ix_admission_applications_converted_guardian_id",
        "admission_applications", ["converted_guardian_id"],
    )

    op.create_table(
        "student_admission_records",
        sa.Column("student_id", sa.Uuid(), nullable=False),
        sa.Column("form_id", sa.Uuid(), nullable=True),
        sa.Column("application_id", sa.Uuid(), nullable=True),
        sa.Column("form_title", sa.String(length=160), nullable=True),
        sa.Column("fields_definition", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("answers", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("created_by_id", sa.Uuid(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("madrasa_id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["application_id"], ["admission_applications.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["form_id"], ["admission_forms.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["madrasa_id"], ["madaris.id"]),
        sa.ForeignKeyConstraint(["student_id"], ["student_profiles.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("application_id", name="uq_student_admission_record_application"),
        sa.UniqueConstraint("student_id", name="uq_student_admission_record_student"),
    )
    op.create_index("ix_student_admission_records_madrasa_id", "student_admission_records", ["madrasa_id"])
    op.create_index("ix_student_admission_records_student_id", "student_admission_records", ["student_id"])
    op.create_index("ix_student_admission_records_form_id", "student_admission_records", ["form_id"])
    op.create_index("ix_student_admission_records_application_id", "student_admission_records", ["application_id"])

    op.create_table(
        "admin_notifications",
        sa.Column("event_type", sa.String(length=120), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("entity_type", sa.String(length=80), nullable=True),
        sa.Column("entity_id", sa.Uuid(), nullable=True),
        sa.Column("created_by_id", sa.Uuid(), nullable=False),
        sa.Column("read_by_user_ids", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("madrasa_id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["madrasa_id"], ["madaris.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_admin_notifications_madrasa_id", "admin_notifications", ["madrasa_id"])
    op.create_index("ix_admin_notifications_event_type", "admin_notifications", ["event_type"])
    op.create_index("ix_admin_notifications_entity_id", "admin_notifications", ["entity_id"])

    _enable_tenant_rls("student_admission_records")
    _enable_tenant_rls("admin_notifications")


def downgrade() -> None:
    for table_name in ("admin_notifications", "student_admission_records"):
        op.execute(f'DROP POLICY IF EXISTS tenant_isolation ON "{table_name}"')
    op.drop_table("admin_notifications")
    op.drop_table("student_admission_records")

    op.drop_index("ix_admission_applications_converted_guardian_id", table_name="admission_applications")
    op.drop_index("ix_admission_applications_converted_student_id", table_name="admission_applications")
    op.drop_constraint("fk_admission_applications_converted_by", "admission_applications", type_="foreignkey")
    op.drop_constraint("fk_admission_applications_converted_guardian", "admission_applications", type_="foreignkey")
    op.drop_constraint("fk_admission_applications_converted_student", "admission_applications", type_="foreignkey")
    op.drop_column("admission_applications", "converted_at")
    op.drop_column("admission_applications", "converted_by_id")
    op.drop_column("admission_applications", "converted_guardian_id")
    op.drop_column("admission_applications", "converted_student_id")
    op.drop_column("admission_applications", "fields_definition_snapshot")
    op.drop_column("admission_applications", "form_title_snapshot")
    op.drop_column("admission_applications", "status_history")
