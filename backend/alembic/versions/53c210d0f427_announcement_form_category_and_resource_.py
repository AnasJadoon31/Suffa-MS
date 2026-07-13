"""announcement form category and resource category owner

Revision ID: 53c210d0f427
Revises: a2c4e6b8d150
Create Date: 2026-07-13 06:04:54.764102

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '53c210d0f427'
down_revision: Union[str, None] = 'a2c4e6b8d150'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # NOTE: autogenerate also detected an unrelated pre-existing drift on
    # admission_forms.public_token (unique constraint vs. unique index) —
    # left untouched here since it's out of scope for this change (B6/B9/B10
    # categories) and not something to silently alter in passing.
    op.add_column('announcements', sa.Column('category', sa.String(length=60), nullable=True))
    op.add_column('forms', sa.Column('category', sa.String(length=60), nullable=True))
    op.add_column('resource_categories', sa.Column('owner_id', sa.Uuid(), nullable=True))
    op.create_index(op.f('ix_resource_categories_owner_id'), 'resource_categories', ['owner_id'], unique=False)
    op.create_foreign_key(None, 'resource_categories', 'users', ['owner_id'], ['id'])


def downgrade() -> None:
    op.drop_constraint(None, 'resource_categories', type_='foreignkey')
    op.drop_index(op.f('ix_resource_categories_owner_id'), table_name='resource_categories')
    op.drop_column('resource_categories', 'owner_id')
    op.drop_column('forms', 'category')
    op.drop_column('announcements', 'category')
