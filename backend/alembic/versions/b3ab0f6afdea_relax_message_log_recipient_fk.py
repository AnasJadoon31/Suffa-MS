"""relax message log recipient fk

Revision ID: b3ab0f6afdea
Revises: a0b7499feaec
Create Date: 2026-07-06 19:34:17.523235

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b3ab0f6afdea'
down_revision: Union[str, None] = 'a0b7499feaec'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # recipient_id is polymorphic (guardian/student/teacher), not always a users.id row
    op.drop_constraint("message_logs_recipient_id_fkey", "message_logs", type_="foreignkey")


def downgrade() -> None:
    op.create_foreign_key(
        "message_logs_recipient_id_fkey", "message_logs", "users", ["recipient_id"], ["id"]
    )
