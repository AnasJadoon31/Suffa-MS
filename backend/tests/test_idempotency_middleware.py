"""Covers app/core/idempotency.py — the generic Idempotency-Key request guard
added so the frontend's offline mutation queue (app/src/lib/mms/mutationQueue.ts)
can safely resend a mutation it isn't sure reached the server (a client crash
between the server committing and the client's local queue clearing it, or two
tabs of the same PWA racing on the same queued entry) without applying it
twice. Real Redis is used (not mocked) since that's the actual claim/cache
backend in production.

Uses POST /api/v1/academics/programs as a stand-in "generic mutation" —
nothing about it is idempotency-aware on its own, so a duplicate send that
isn't deduped would visibly create a second row. The seed fixture already
creates one Program, so assertions compare against a baseline count taken at
the start of each test rather than an absolute number.
"""
import asyncio

import pytest
from sqlalchemy import select

import app.core.rate_limit as rate_limit
from app.modules.academics.models import Program


@pytest.fixture(autouse=True)
async def clear_idempotency_keys():
    """Isolate tests from each other and from anything else exercising Redis
    at the same key prefix. get_redis() caches its client on a module-level
    global; pytest-asyncio gives each test function its own event loop, so
    reusing a client created in an earlier test's (now-closed) loop breaks —
    force a fresh connection bound to *this* test's loop instead."""
    rate_limit._redis = None
    client = rate_limit.get_redis()
    async for key in client.scan_iter(match="idempotency:*"):
        await client.delete(key)
    yield
    async for key in client.scan_iter(match="idempotency:*"):
        await client.delete(key)
    await client.aclose()
    rate_limit._redis = None


async def _program_count(db_session, madrasa_id) -> int:
    result = await db_session.execute(select(Program).where(Program.madrasa_id == madrasa_id))
    return len(result.scalars().all())


async def test_duplicate_request_with_same_key_creates_only_one_record(client, seed, db_session):
    baseline = await _program_count(db_session, seed.madrasa.id)
    headers = {"Idempotency-Key": "test-key-dup-1"}
    first = await client.post(
        "/api/v1/academics/programs", json={"name": "Hifz Evening"}, headers=headers
    )
    second = await client.post(
        "/api/v1/academics/programs", json={"name": "Hifz Evening"}, headers=headers
    )

    assert first.status_code == 200
    assert second.status_code == 200
    # The second call replays the cached response rather than re-executing.
    assert first.json() == second.json()
    assert await _program_count(db_session, seed.madrasa.id) == baseline + 1


async def test_different_keys_both_execute(client, seed, db_session):
    baseline = await _program_count(db_session, seed.madrasa.id)
    first = await client.post(
        "/api/v1/academics/programs",
        json={"name": "Program A"},
        headers={"Idempotency-Key": "test-key-a"},
    )
    second = await client.post(
        "/api/v1/academics/programs",
        json={"name": "Program B"},
        headers={"Idempotency-Key": "test-key-b"},
    )

    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json()["id"] != second.json()["id"]
    assert await _program_count(db_session, seed.madrasa.id) == baseline + 2


async def test_no_header_is_unaffected(client, seed, db_session):
    """Normal interactive traffic never sends this header — confirm the
    middleware doesn't engage at all and both requests execute normally."""
    baseline = await _program_count(db_session, seed.madrasa.id)
    await client.post("/api/v1/academics/programs", json={"name": "No Header A"})
    await client.post("/api/v1/academics/programs", json={"name": "No Header B"})

    assert await _program_count(db_session, seed.madrasa.id) == baseline + 2


async def test_concurrent_requests_with_same_key_create_only_one_record(client, seed, db_session):
    """The scenario this exists for: two near-simultaneous sends of the same
    queued mutation (two tabs, or a retry racing an in-flight attempt)."""
    baseline = await _program_count(db_session, seed.madrasa.id)
    headers = {"Idempotency-Key": "test-key-concurrent"}
    responses = await asyncio.gather(
        client.post("/api/v1/academics/programs", json={"name": "Race"}, headers=headers),
        client.post("/api/v1/academics/programs", json={"name": "Race"}, headers=headers),
    )

    statuses = sorted(r.status_code for r in responses)
    # Either both eventually see the same successful outcome (200/200, one a
    # cache hit), or the loser of the race gets a 409 telling it to retry —
    # both are correct; a created duplicate is the only wrong outcome.
    assert statuses in ([200, 200], [200, 409])
    assert await _program_count(db_session, seed.madrasa.id) == baseline + 1


async def test_failed_request_is_not_cached(client, seed, db_session):
    """A request that fails validation shouldn't poison the key — retrying
    with a valid payload under the same key must actually execute."""
    baseline = await _program_count(db_session, seed.madrasa.id)
    headers = {"Idempotency-Key": "test-key-retry-after-failure"}
    failed = await client.post("/api/v1/academics/programs", json={}, headers=headers)
    assert failed.status_code == 422

    retried = await client.post(
        "/api/v1/academics/programs", json={"name": "Recovered"}, headers=headers
    )
    assert retried.status_code == 200
    assert await _program_count(db_session, seed.madrasa.id) == baseline + 1
