from pathlib import Path


MIGRATION = Path(__file__).parents[1] / "alembic" / "versions" / "6f41c8a2d9b0_enable_tenant_rls.py"


def test_rls_migration_covers_direct_and_indirect_tenant_tables():
    source = MIGRATION.read_text(encoding="utf-8")
    assert "FORCE ROW LEVEL SECURITY" in source
    assert "WITH CHECK" in source
    assert "marks" in source
    assert "submissions" in source
    assert "student_guardians" in source
    assert "user_permissions" in source
    assert "app.current_madrasa_id" in source
    assert "app.is_super_admin" in source
