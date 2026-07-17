"""Enable PostgreSQL row-level security for tenant business data.

Revision ID: 6f41c8a2d9b0
Revises: 53c210d0f427
"""

from collections.abc import Sequence

from alembic import op

revision: str = "6f41c8a2d9b0"
down_revision: str | None = "53c210d0f427"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


DIRECT_POLICY = """
    current_setting('app.is_super_admin', true) = 'true'
    OR madrasa_id = NULLIF(current_setting('app.current_madrasa_id', true), '')::uuid
"""

INDIRECT_POLICIES = {
    "marks": """
        current_setting('app.is_super_admin', true) = 'true'
        OR EXISTS (
            SELECT 1 FROM exam_types parent
            WHERE parent.id = marks.exam_type_id
              AND parent.madrasa_id = NULLIF(current_setting('app.current_madrasa_id', true), '')::uuid
        )
    """,
    "submissions": """
        current_setting('app.is_super_admin', true) = 'true'
        OR EXISTS (
            SELECT 1 FROM assignments parent
            WHERE parent.id = submissions.assignment_id
              AND parent.madrasa_id = NULLIF(current_setting('app.current_madrasa_id', true), '')::uuid
        )
    """,
    "student_guardians": """
        current_setting('app.is_super_admin', true) = 'true'
        OR EXISTS (
            SELECT 1 FROM student_profiles parent
            WHERE parent.id = student_guardians.student_id
              AND parent.madrasa_id = NULLIF(current_setting('app.current_madrasa_id', true), '')::uuid
        )
    """,
    "user_permissions": """
        current_setting('app.is_super_admin', true) = 'true'
        OR EXISTS (
            SELECT 1 FROM users parent
            WHERE parent.id = user_permissions.user_id
              AND parent.madrasa_id = NULLIF(current_setting('app.current_madrasa_id', true), '')::uuid
        )
    """,
}


def _enable_policy(table: str, expression: str) -> None:
    op.execute(f'ALTER TABLE "{table}" ENABLE ROW LEVEL SECURITY')
    op.execute(f'ALTER TABLE "{table}" FORCE ROW LEVEL SECURITY')
    op.execute(f'DROP POLICY IF EXISTS tenant_isolation ON "{table}"')
    op.execute(
        f'CREATE POLICY tenant_isolation ON "{table}" '
        f'FOR ALL USING ({expression}) WITH CHECK ({expression})'
    )


def upgrade() -> None:
    connection = op.get_bind()
    direct_tables = connection.exec_driver_sql(
        """
        SELECT table_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND column_name = 'madrasa_id'
          AND table_name <> 'users'
        ORDER BY table_name
        """
    ).scalars().all()
    for table in direct_tables:
        _enable_policy(table, DIRECT_POLICY)
    for table, expression in INDIRECT_POLICIES.items():
        _enable_policy(table, expression)


def downgrade() -> None:
    connection = op.get_bind()
    direct_tables = connection.exec_driver_sql(
        """
        SELECT table_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND column_name = 'madrasa_id'
          AND table_name <> 'users'
        """
    ).scalars().all()
    for table in [*direct_tables, *INDIRECT_POLICIES]:
        op.execute(f'DROP POLICY IF EXISTS tenant_isolation ON "{table}"')
        op.execute(f'ALTER TABLE "{table}" NO FORCE ROW LEVEL SECURITY')
        op.execute(f'ALTER TABLE "{table}" DISABLE ROW LEVEL SECURITY')
