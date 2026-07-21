"""Add category to AdmissionForm

Revision ID: f8cf3ec5ccc3
Revises: aaeb664a3063
Create Date: 2026-07-21 14:00:02.556586

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f8cf3ec5ccc3'
down_revision: Union[str, None] = 'aaeb664a3063'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Existing admission forms predate categories. Add the column in three
    # steps so PostgreSQL never has to apply NOT NULL while legacy rows are
    # still missing a value.
    op.add_column('admission_forms', sa.Column('category', sa.String(length=60), nullable=True))
    op.execute(sa.text("UPDATE admission_forms SET category = 'General' WHERE category IS NULL"))
    op.alter_column(
        'admission_forms',
        'category',
        existing_type=sa.String(length=60),
        nullable=False,
    )
    op.alter_column('admission_forms', 'program_id',
               existing_type=sa.UUID(),
               nullable=True)
    op.drop_index('uq_course_madrasa_normalized_name', table_name='courses')
    op.create_index('uq_course_madrasa_normalized_name', 'courses', ['madrasa_id', sa.text('lower(trim(name))')], unique=True)


def downgrade() -> None:
    op.drop_index('uq_course_madrasa_normalized_name', table_name='courses')
    op.create_index('uq_course_madrasa_normalized_name', 'courses', ['madrasa_id', sa.text('lower(TRIM(BOTH FROM name))')], unique=True)
    op.alter_column('admission_forms', 'program_id',
               existing_type=sa.UUID(),
               nullable=False)
    op.drop_column('admission_forms', 'category')
