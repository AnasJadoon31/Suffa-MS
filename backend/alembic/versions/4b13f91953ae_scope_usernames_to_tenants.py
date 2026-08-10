"""scope usernames to tenants

Revision ID: 4b13f91953ae
Revises: 32502fc5c5d0
Create Date: 2026-08-10 23:17:22.571360

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '4b13f91953ae'
down_revision: Union[str, None] = '32502fc5c5d0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("DROP INDEX IF EXISTS ix_users_username")
        op.create_index("ix_users_username", "users", ["username"], unique=False)
        op.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS uq_users_platform_username "
            "ON users (username) WHERE madrasa_id IS NULL"
        )
    else:
        op.drop_index("ix_users_username", table_name="users")
        op.create_index("ix_users_username", "users", ["username"], unique=False)


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("DROP INDEX IF EXISTS uq_users_platform_username")
        duplicate = bind.execute(
            sa.text("SELECT username FROM users GROUP BY username HAVING count(*) > 1 LIMIT 1")
        ).scalar()
        if duplicate is not None:
            raise RuntimeError("Cannot restore global username uniqueness while tenant-scoped duplicates exist")
    op.drop_index("ix_users_username", table_name="users")
    op.create_index("ix_users_username", "users", ["username"], unique=True)
