"""Database-level serialization for automatic Alembic migrations."""

from typing import Any

from sqlalchemy import text
from sqlalchemy.engine import Connection


# Application-specific PostgreSQL advisory lock key.
MIGRATION_LOCK_ID = 1_397_050_835


def acquire_migration_lock(connection: Connection) -> None:
    """Serialize PostgreSQL migrations for the current Alembic transaction."""
    if connection.dialect.name == "postgresql":
        connection.execute(
            text("SELECT pg_advisory_xact_lock(:lock_id)"),
            {"lock_id": MIGRATION_LOCK_ID},
        )


def run_migrations_with_lock(
    connection: Connection,
    migration_context: Any,
    target_metadata: Any,
) -> None:
    """Run Alembic only after its transaction owns the migration lock."""
    migration_context.configure(connection=connection, target_metadata=target_metadata)

    with migration_context.begin_transaction():
        acquire_migration_lock(connection)
        migration_context.run_migrations()
