"""ISS3-012: Enhance guardian-student links with relationship and access control

Revision ID: iss3_012_guardian_links
Revises: 84d3b7e91a20
Create Date: 2026-07-23

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "iss3_012_guardian_links"
down_revision: Union[str, None] = "84d3b7e91a20"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add relationship column (does not exist yet)
    op.add_column("student_guardians", sa.Column("relationship", sa.String(80), nullable=True, server_default="guardian"))
    
    # Add is_primary column
    op.add_column("student_guardians", sa.Column("is_primary", sa.Boolean(), nullable=True, server_default=sa.text("false")))
    
    # Add portal_access column
    op.add_column("student_guardians", sa.Column("portal_access", sa.Boolean(), nullable=True, server_default=sa.text("true")))
    
    # Create unique constraint
    op.create_unique_constraint("uq_student_guardian", "student_guardians", ["student_id", "guardian_id"])
    
    # Backfill madrasa_id from student_profiles (if madrasa_id was added by TenantMixin but not backfilled)
    op.execute("""
        UPDATE student_guardians sg
        SET madrasa_id = sp.madrasa_id
        FROM student_profiles sp
        WHERE sg.student_id = sp.id AND sg.madrasa_id IS NULL
    """)


def downgrade() -> None:
    op.drop_constraint("uq_student_guardian", "student_guardians", type_="unique")
    op.drop_column("student_guardians", "portal_access")
    op.drop_column("student_guardians", "is_primary")
    op.drop_column("student_guardians", "relationship")