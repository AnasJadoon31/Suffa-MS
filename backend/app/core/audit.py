from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.core_models import AuditLog


def record_audit(
    session: AsyncSession,
    *,
    madrasa_id: UUID,
    actor_id: UUID,
    action: str,
    entity_name: str,
    entity_id: str,
    old_values: dict,
    new_values: dict,
) -> None:
    session.add(
        AuditLog(
            madrasa_id=madrasa_id,
            actor_id=actor_id,
            action=action,
            entity_name=entity_name,
            entity_id=entity_id,
            old_values=old_values,
            new_values=new_values,
            action_time=datetime.now(UTC),
        )
    )
