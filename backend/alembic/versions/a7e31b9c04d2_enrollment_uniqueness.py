"""enrollment uniqueness

One enrollment per (student, session). The enroll endpoint used to insert
unconditionally, so repeated enrolls stacked duplicate rows and broke every
scalar_one_or_none() lookup downstream. Keep the most recent row, then
enforce uniqueness.

Revision ID: a7e31b9c04d2
Revises: f9d24a7c81e3
Create Date: 2026-07-09

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a7e31b9c04d2'
down_revision: Union[str, None] = 'f9d24a7c81e3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        DELETE FROM enrollments a
        USING enrollments b
        WHERE a.student_id = b.student_id
          AND a.session_id = b.session_id
          AND (a.created_at < b.created_at
               OR (a.created_at = b.created_at AND a.id < b.id))
        """
    )
    op.create_unique_constraint(
        "uq_enrollment_student_session", "enrollments", ["student_id", "session_id"]
    )


def downgrade() -> None:
    op.drop_constraint("uq_enrollment_student_session", "enrollments", type_="unique")
