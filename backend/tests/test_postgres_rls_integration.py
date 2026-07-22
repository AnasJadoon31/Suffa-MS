"""Real PostgreSQL tenant-isolation verification.

Run this against an Alembic-migrated disposable database by setting
``TEST_RLS_DATABASE_URL`` to a superuser connection URL.  The test creates a
temporary non-owner login because PostgreSQL table owners bypass RLS.
"""

import os
from uuid import uuid4

import pytest
from sqlalchemy import text
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import create_async_engine


@pytest.mark.asyncio
async def test_postgres_rls_hides_other_madrasa_rows():
    database_url = os.getenv("TEST_RLS_DATABASE_URL")
    if not database_url:
        pytest.skip("requires an Alembic-migrated disposable PostgreSQL database")

    first_madrasa = uuid4()
    second_madrasa = uuid4()
    first_program = uuid4()
    second_program = uuid4()
    role = f"codex_rls_{uuid4().hex}"
    password = uuid4().hex
    admin_engine = create_async_engine(database_url)

    try:
        async with admin_engine.begin() as connection:
            await connection.execute(
                text(
                    "INSERT INTO madaris (id, name, slug, public_key, content_language, created_at, updated_at) "
                    "VALUES (:first_id, 'First tenant', :first_slug, :first_key, 'en', now(), now()), "
                    "(:second_id, 'Second tenant', :second_slug, :second_key, 'en', now(), now())"
                ),
                {
                    "first_id": first_madrasa,
                    "first_slug": f"first-{first_madrasa.hex}",
                    "first_key": first_madrasa.hex,
                    "second_id": second_madrasa,
                    "second_slug": f"second-{second_madrasa.hex}",
                    "second_key": second_madrasa.hex,
                },
            )
            await connection.execute(
                text(
                    "INSERT INTO programs (id, madrasa_id, name, created_at, updated_at) VALUES "
                    "(:first_program, :first_madrasa, 'First program', now(), now()), "
                    "(:second_program, :second_madrasa, 'Second program', now(), now())"
                ),
                {
                    "first_program": first_program,
                    "first_madrasa": first_madrasa,
                    "second_program": second_program,
                    "second_madrasa": second_madrasa,
                },
            )
            await connection.execute(text(f'CREATE ROLE "{role}" LOGIN PASSWORD \'{password}\''))
            await connection.execute(text(f'GRANT USAGE ON SCHEMA public TO "{role}"'))
            await connection.execute(text(f'GRANT SELECT ON madaris, programs TO "{role}"'))

        reader_url = make_url(database_url).set(username=role, password=password)
        reader_engine = create_async_engine(reader_url)
        try:
            async with reader_engine.connect() as connection:
                assert (await connection.execute(text("SELECT name FROM programs"))).scalars().all() == []

                await connection.execute(
                    text("SELECT set_config('app.current_madrasa_id', :madrasa_id, true)"),
                    {"madrasa_id": str(first_madrasa)},
                )
                assert (await connection.execute(text("SELECT name FROM programs"))).scalars().all() == ["First program"]

            async with reader_engine.connect() as connection:
                await connection.execute(
                    text("SELECT set_config('app.current_madrasa_id', :madrasa_id, true)"),
                    {"madrasa_id": str(second_madrasa)},
                )
                assert (await connection.execute(text("SELECT name FROM programs"))).scalars().all() == ["Second program"]
        finally:
            await reader_engine.dispose()
    finally:
        async with admin_engine.begin() as connection:
            await connection.execute(
                text("DELETE FROM programs WHERE id IN (:first_program, :second_program)"),
                {"first_program": first_program, "second_program": second_program},
            )
            await connection.execute(
                text("DELETE FROM madaris WHERE id IN (:first_madrasa, :second_madrasa)"),
                {"first_madrasa": first_madrasa, "second_madrasa": second_madrasa},
            )
            await connection.execute(text(f'DROP OWNED BY "{role}"'))
            await connection.execute(text(f'DROP ROLE IF EXISTS "{role}"'))
        await admin_engine.dispose()
