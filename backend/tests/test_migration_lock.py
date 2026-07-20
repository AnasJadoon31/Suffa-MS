"""Tests for serializing automatic PostgreSQL migrations."""

from app.db.migration_lock import (
    MIGRATION_LOCK_ID,
    acquire_migration_lock,
    run_migrations_with_lock,
)


class _Dialect:
    def __init__(self, name: str):
        self.name = name


class _Connection:
    def __init__(self, dialect_name: str = "postgresql"):
        self.dialect = _Dialect(dialect_name)
        self.calls: list[tuple[str, dict[str, int]]] = []

    def execute(self, statement, parameters):
        self.calls.append((str(statement), parameters))


class _Transaction:
    def __init__(self, events):
        self.events = events

    def __enter__(self):
        self.events.append("transaction entered")

    def __exit__(self, *args):
        self.events.append("transaction exited")


class _MigrationContext:
    def __init__(self, connection):
        self.connection = connection
        self.events = []

    def configure(self, **kwargs):
        self.events.append("configured")

    def begin_transaction(self):
        return _Transaction(self.events)

    def run_migrations(self):
        assert self.connection.calls
        self.events.append("migrations run")


def test_postgresql_migration_uses_transaction_scoped_lock():
    connection = _Connection()

    acquire_migration_lock(connection)

    assert connection.calls == [
        ("SELECT pg_advisory_xact_lock(:lock_id)", {"lock_id": MIGRATION_LOCK_ID}),
    ]


def test_non_postgresql_database_does_not_use_advisory_lock():
    connection = _Connection("sqlite")

    acquire_migration_lock(connection)

    assert connection.calls == []


def test_lock_is_acquired_inside_alembic_transaction_before_migrations():
    connection = _Connection()
    migration_context = _MigrationContext(connection)

    run_migrations_with_lock(connection, migration_context, object())

    assert migration_context.events == [
        "configured",
        "transaction entered",
        "migrations run",
        "transaction exited",
    ]
    assert connection.calls[0][0] == "SELECT pg_advisory_xact_lock(:lock_id)"
