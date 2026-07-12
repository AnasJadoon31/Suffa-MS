"""madrasa public_key + admission_forms + application form link (B12)

Revision ID: a2c4e6b8d150
Revises: f1b6d8e3a742
Create Date: 2026-07-12

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "a2c4e6b8d150"
down_revision: Union[str, None] = "f1b6d8e3a742"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

PortableJSON = sa.JSON().with_variant(JSONB(), "postgresql")


def upgrade() -> None:
    op.add_column("madaris", sa.Column("public_key", sa.String(length=64), nullable=True))
    # Backfill each existing madrasa with a random key, then enforce presence.
    op.execute("UPDATE madaris SET public_key = md5(random()::text) WHERE public_key IS NULL")
    op.alter_column("madaris", "public_key", nullable=False)
    op.create_unique_constraint("uq_madaris_public_key", "madaris", ["public_key"])

    op.create_table(
        "admission_forms",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("madrasa_id", sa.Uuid(), nullable=False),
        sa.Column("program_id", sa.Uuid(), nullable=False),
        sa.Column("title", sa.String(length=160), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("fields_definition", PortableJSON, nullable=False),
        sa.Column("public_token", sa.String(length=64), nullable=False),
        sa.Column("is_open", sa.Boolean(), nullable=False),
        sa.Column("created_by_id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["madrasa_id"], ["madaris.id"]),
        sa.ForeignKeyConstraint(["program_id"], ["programs.id"]),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("public_token"),
    )
    op.create_index(op.f("ix_admission_forms_madrasa_id"), "admission_forms", ["madrasa_id"])
    op.create_index(op.f("ix_admission_forms_program_id"), "admission_forms", ["program_id"])
    op.create_index(op.f("ix_admission_forms_public_token"), "admission_forms", ["public_token"])

    op.add_column("admission_applications", sa.Column("form_id", sa.Uuid(), nullable=True))
    op.add_column("admission_applications", sa.Column("extra_data", PortableJSON, nullable=True))
    op.create_foreign_key(
        "fk_admission_applications_form", "admission_applications", "admission_forms", ["form_id"], ["id"]
    )
    op.create_index(op.f("ix_admission_applications_form_id"), "admission_applications", ["form_id"])


def downgrade() -> None:
    op.drop_index(op.f("ix_admission_applications_form_id"), table_name="admission_applications")
    op.drop_constraint("fk_admission_applications_form", "admission_applications", type_="foreignkey")
    op.drop_column("admission_applications", "extra_data")
    op.drop_column("admission_applications", "form_id")
    op.drop_index(op.f("ix_admission_forms_public_token"), table_name="admission_forms")
    op.drop_index(op.f("ix_admission_forms_program_id"), table_name="admission_forms")
    op.drop_index(op.f("ix_admission_forms_madrasa_id"), table_name="admission_forms")
    op.drop_table("admission_forms")
    op.drop_constraint("uq_madaris_public_key", "madaris", type_="unique")
    op.drop_column("madaris", "public_key")
