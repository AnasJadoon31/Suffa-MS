import os

import pytest


async def test_requested_postgres_database_is_the_active_test_engine(engine):
    if not os.getenv("TEST_DATABASE_URL"):
        pytest.skip("PostgreSQL verification runs only when TEST_DATABASE_URL is configured")

    assert engine.dialect.name == "postgresql"
