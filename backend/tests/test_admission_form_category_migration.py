"""Regression coverage for upgrading admission forms that predate categories."""

from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path


def test_category_migration_backfills_legacy_admission_forms(monkeypatch):
    migration_path = (
        Path(__file__).parents[1]
        / "alembic"
        / "versions"
        / "f8cf3ec5ccc3_add_category_to_admissionform.py"
    )
    spec = spec_from_file_location("admission_form_category_migration", migration_path)
    assert spec and spec.loader
    migration = module_from_spec(spec)
    spec.loader.exec_module(migration)

    operations: list[tuple[str, object]] = []

    def add_column(table_name, column):
        # A production table contains legacy rows. PostgreSQL rejects adding a
        # required column unless the migration supplies a value for those rows.
        assert column.nullable or column.server_default is not None, (
            "legacy admission_forms would contain NULL category values"
        )
        operations.append(("add", column))

    monkeypatch.setattr(migration.op, "add_column", add_column)
    monkeypatch.setattr(
        migration.op,
        "execute",
        lambda statement: operations.append(("execute", str(statement))),
    )
    monkeypatch.setattr(
        migration.op,
        "alter_column",
        lambda table_name, column_name, **kwargs: operations.append(("alter", (column_name, kwargs))),
    )
    monkeypatch.setattr(migration.op, "drop_index", lambda *args, **kwargs: None)
    monkeypatch.setattr(migration.op, "create_index", lambda *args, **kwargs: None)

    migration.upgrade()

    category_changes = [payload for action, payload in operations if action == "alter" and payload[0] == "category"]
    assert any(action == "execute" and "SET category = 'General'" in payload for action, payload in operations)
    assert category_changes
    assert category_changes[-1][1]["nullable"] is False
