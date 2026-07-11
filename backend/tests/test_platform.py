"""Super-admin tier: platform endpoints + feature flags (§1 of IMPLEMENT.md)."""
import pytest

from sqlalchemy import select

from app.modules.auth.models import User, UserRole, UserStatus
from app.modules.platform.models import MadrasaFeature

from tests.conftest import _make_client
from app.main import app as fastapi_app


@pytest.fixture
async def super_admin(db_sessionmaker):
    async with db_sessionmaker() as db:
        user = User(
            madrasa_id=None, username="platform-admin", password_hash="x",
            role=UserRole.super_admin, status=UserStatus.active,
        )
        db.add(user)
        await db.commit()
    return user


@pytest.fixture
async def super_client(db_sessionmaker, seed, super_admin):
    async_client = _make_client(db_sessionmaker, seed, super_admin)
    async with async_client:
        yield async_client
    fastapi_app.dependency_overrides.clear()


async def test_platform_routes_reject_principal(client):
    response = await client.get("/api/v1/platform/madaris")
    assert response.status_code == 403


async def test_super_admin_lists_madaris(super_client):
    response = await super_client.get("/api/v1/platform/madaris")
    assert response.status_code == 200
    assert [m["slug"] for m in response.json()] == ["test"]


async def test_onboard_madrasa_with_disabled_features(super_client, db_sessionmaker):
    response = await super_client.post(
        "/api/v1/platform/madaris",
        json={
            "name": "New Madrasa",
            "slug": "new-madrasa",
            "principal_username": "new-principal",
            "disabled_features": ["finance", "blog"],
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["set_password_url"].startswith("/set-password?token=")

    features = await super_client.get(f"/api/v1/platform/madaris/{body['madrasa_id']}/features")
    state = {f["key"]: f["enabled"] for f in features.json()}
    assert state["finance"] is False
    assert state["blog"] is False
    assert state["attendance"] is True

    async with db_sessionmaker() as db:
        principal = (
            await db.execute(select(User).where(User.username == "new-principal"))
        ).scalar_one()
        assert principal.role == UserRole.principal
        assert str(principal.madrasa_id) == body["madrasa_id"]


async def test_onboard_rejects_unknown_feature(super_client):
    response = await super_client.post(
        "/api/v1/platform/madaris",
        json={
            "name": "Second Madrasa",
            "slug": "x-madrasa",
            "principal_username": "x-principal",
            "disabled_features": ["no-such-feature"],
        },
    )
    assert response.status_code == 400


async def test_feature_flag_disables_module_router(super_client, client, seed):
    # Baseline: finance list works for the principal.
    before = await client.get("/api/v1/finance/payments")
    assert before.status_code == 200

    flip = await super_client.put(
        f"/api/v1/platform/madaris/{seed.madrasa.id}/features",
        json={"features": {"finance": False}},
    )
    assert flip.status_code == 200

    after = await client.get("/api/v1/finance/payments")
    assert after.status_code == 403
    assert "finance" in after.json()["detail"]

    # Flags round-trip: re-enable restores access.
    await super_client.put(
        f"/api/v1/platform/madaris/{seed.madrasa.id}/features",
        json={"features": {"finance": True}},
    )
    restored = await client.get("/api/v1/finance/payments")
    assert restored.status_code == 200


async def test_principal_has_no_write_path_to_feature_flags(client, seed, db_sessionmaker):
    response = await client.put(
        f"/api/v1/platform/madaris/{seed.madrasa.id}/features",
        json={"features": {"finance": False}},
    )
    assert response.status_code == 403
    async with db_sessionmaker() as db:
        rows = (await db.execute(select(MadrasaFeature))).scalars().all()
        assert rows == []


async def test_me_includes_feature_map(client):
    response = await client.get("/api/v1/auth/me")
    assert response.status_code == 200
    features = response.json()["features"]
    assert features.get("attendance") is True
    assert "finance" in features
