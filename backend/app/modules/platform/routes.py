"""Platform (super-admin) endpoints: madrasa onboarding + feature flags.

Every route requires the super_admin role. Feature flags live here and only
here — principals have no endpoint that writes madrasa_features, so a super
admin's onboarding decisions cannot be overridden from inside a tenant.
"""
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import record_audit
from app.core.dependencies import get_enabled_features, require_super_admin
from app.core.features import FEATURES, FEATURE_KEYS
from app.core.pagination import DEFAULT_LIMIT, MAX_LIMIT, paginate_scalars
from app.db.session import get_session
from app.modules.academics.models import Madrasa
from app.modules.auth.models import User, UserRole
from app.modules.auth.service import UsernameTakenError, provision_login
from app.modules.platform.models import MadrasaFeature
from app.modules.platform.schemas import (
    FeatureFlagRead,
    FeatureFlagsUpdate,
    MadrasaCreateRequest,
    MadrasaCreateResponse,
    PlatformMadrasaRead,
)

router = APIRouter()


async def _get_madrasa_or_404(session: AsyncSession, madrasa_id: UUID) -> Madrasa:
    madrasa = await session.get(Madrasa, madrasa_id)
    if madrasa is None:
        raise HTTPException(status_code=404, detail="Madrasa not found")
    return madrasa


@router.get("/madaris", response_model=list[PlatformMadrasaRead])
async def list_madaris(
    response: Response,
    current_user: User = Depends(require_super_admin),
    session: AsyncSession = Depends(get_session),
    limit: int = Query(default=DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
) -> list[PlatformMadrasaRead]:
    stmt = select(Madrasa)
    rows = await paginate_scalars(
        session, stmt.order_by(Madrasa.created_at), limit=limit, offset=offset, response=response
    )
    return [PlatformMadrasaRead.model_validate(row) for row in rows]


@router.post("/madaris", response_model=MadrasaCreateResponse)
async def create_madrasa(
    payload: MadrasaCreateRequest,
    current_user: User = Depends(require_super_admin),
    session: AsyncSession = Depends(get_session),
) -> MadrasaCreateResponse:
    unknown = [key for key in payload.disabled_features if key not in FEATURE_KEYS]
    if unknown:
        raise HTTPException(status_code=400, detail=f"Unknown features: {', '.join(sorted(unknown))}")

    slug_taken = await session.execute(select(Madrasa).where(Madrasa.slug == payload.slug))
    if slug_taken.scalar_one_or_none() is not None:
        raise HTTPException(status_code=409, detail=f"Slug '{payload.slug}' already exists")

    madrasa = Madrasa(name=payload.name, slug=payload.slug, content_language=payload.content_language)
    session.add(madrasa)
    await session.flush()

    try:
        principal, set_password_url = await provision_login(
            session,
            madrasa_id=madrasa.id,
            actor_id=current_user.id,
            username=payload.principal_username,
            role=UserRole.principal,
        )
    except UsernameTakenError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc

    for key in set(payload.disabled_features):
        session.add(
            MadrasaFeature(madrasa_id=madrasa.id, feature_key=key, enabled=False, set_by_id=current_user.id)
        )

    record_audit(
        session,
        madrasa_id=madrasa.id,
        actor_id=current_user.id,
        action="platform.madrasa.create",
        entity_name="madrasa",
        entity_id=str(madrasa.id),
        old_values=None,
        new_values={
            "slug": payload.slug,
            "disabled_features": sorted(set(payload.disabled_features)),
        },
    )
    await session.commit()

    return MadrasaCreateResponse(
        madrasa_id=madrasa.id,
        slug=madrasa.slug,
        principal_user_id=principal.id,
        set_password_url=set_password_url,
    )


@router.get("/madaris/{madrasa_id}/features", response_model=list[FeatureFlagRead])
async def get_madrasa_features(
    madrasa_id: UUID,
    current_user: User = Depends(require_super_admin),
    session: AsyncSession = Depends(get_session),
) -> list[FeatureFlagRead]:
    await _get_madrasa_or_404(session, madrasa_id)
    enabled = await get_enabled_features(madrasa_id, session)
    return [
        FeatureFlagRead(key=feature.key, label=feature.label, enabled=enabled[feature.key])
        for feature in FEATURES
    ]


@router.put("/madaris/{madrasa_id}/features", response_model=list[FeatureFlagRead])
async def update_madrasa_features(
    madrasa_id: UUID,
    payload: FeatureFlagsUpdate,
    current_user: User = Depends(require_super_admin),
    session: AsyncSession = Depends(get_session),
) -> list[FeatureFlagRead]:
    await _get_madrasa_or_404(session, madrasa_id)

    unknown = [key for key in payload.features if key not in FEATURE_KEYS]
    if unknown:
        raise HTTPException(status_code=400, detail=f"Unknown features: {', '.join(sorted(unknown))}")

    old_state = await get_enabled_features(madrasa_id, session)

    existing = {
        row.feature_key: row
        for row in (
            await session.execute(select(MadrasaFeature).where(MadrasaFeature.madrasa_id == madrasa_id))
        ).scalars().all()
    }
    for key, enabled in payload.features.items():
        if key in existing:
            existing[key].enabled = enabled
            existing[key].set_by_id = current_user.id
        else:
            session.add(
                MadrasaFeature(madrasa_id=madrasa_id, feature_key=key, enabled=enabled, set_by_id=current_user.id)
            )

    record_audit(
        session,
        madrasa_id=madrasa_id,
        actor_id=current_user.id,
        action="platform.features.update",
        entity_name="madrasa",
        entity_id=str(madrasa_id),
        old_values={"features": old_state},
        new_values={"features": {**old_state, **payload.features}},
    )
    await session.commit()

    enabled = await get_enabled_features(madrasa_id, session)
    return [
        FeatureFlagRead(key=feature.key, label=feature.label, enabled=enabled[feature.key])
        for feature in FEATURES
    ]
