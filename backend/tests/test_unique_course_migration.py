"""Regression test for automatic legacy duplicate-course migration."""

from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path
from uuid import uuid4


class _Rows:
    def __init__(self, rows):
        self._rows = rows

    def fetchall(self):
        return self._rows


class _MigrationBind:
    def __init__(self, duplicate_group):
        self.duplicate_group = duplicate_group
        self.statements: list[str] = []

    def exec_driver_sql(self, statement, parameters=None):
        self.statements.append(str(statement))
        if "GROUP BY madrasa_id" in str(statement):
            return _Rows([self.duplicate_group])
        return _Rows([])

    def execute(self, statement, parameters=None):
        self.statements.append(str(statement))
        return _Rows([])


def test_duplicate_courses_are_merged_before_unique_index(monkeypatch):
    migration_path = Path(__file__).parents[1] / "alembic" / "versions" / "7a2f1c9d4e60_unique_course_names.py"
    spec = spec_from_file_location("unique_course_names_migration", migration_path)
    assert spec and spec.loader
    migration = module_from_spec(spec)
    spec.loader.exec_module(migration)
    canonical_id, duplicate_id = uuid4(), uuid4()
    bind = _MigrationBind((uuid4(), "tajweed", [canonical_id, duplicate_id]))
    created_indexes = []
    monkeypatch.setattr(migration.op, "get_bind", lambda: bind)
    monkeypatch.setattr(migration.op, "create_index", lambda *args, **kwargs: created_indexes.append((args, kwargs)))

    migration.upgrade()

    migration_sql = "\n".join(bind.statements)
    for table in ("class_courses", "teacher_assignments", "timetable_slots", "assignments", "exam_types"):
        assert table in migration_sql
    assert "DELETE FROM courses" in migration_sql
    assert created_indexes[0][0][0] == "uq_course_madrasa_normalized_name"
