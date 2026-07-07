"""add contact enquiries table

Revision ID: 1c56ea01e47c
Revises: b3ab0f6afdea
Create Date: 2026-07-07 08:32:26.446311

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '1c56ea01e47c'
down_revision: Union[str, None] = 'b3ab0f6afdea'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "contact_enquiries",
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("contact", sa.String(length=160), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=24), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("madrasa_id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["madrasa_id"], ["madaris.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_contact_enquiries_madrasa_id"), "contact_enquiries", ["madrasa_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_contact_enquiries_madrasa_id"), table_name="contact_enquiries")
    op.drop_table("contact_enquiries")
