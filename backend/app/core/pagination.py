"""Shared pagination for list endpoints (TO_IMPLEMENT.md §A/§E — every list
endpoint must bound its result set; large madrasas will choke on unpaginated
lists otherwise).

Response-shape decision (documented in IMPLEMENTED.md): list endpoints keep
returning a bare JSON array (`response_model=list[...]`) so existing frontend
call sites don't break today. The total row count (ignoring limit/offset) is
stamped onto the `X-Total-Count` response header instead of wrapping the body
in an envelope. Callers that want to page through more than the default
window pass `?limit=&offset=`; callers that ignore the new params get the
first page (limit=50) rather than an unbounded dump.
"""

from typing import Sequence

from fastapi import Query, Response
from sqlalchemy import func, select
from sqlalchemy.engine import Result
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import Select

DEFAULT_LIMIT = 50
MAX_LIMIT = 200

# Routes declare these two Query params inline (FastAPI can't unpack a tuple
# dependency into two path-operation params), e.g.:
#
#   limit: int = Query(DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
#   offset: int = Query(0, ge=0),
#   response: Response,
#   ...
#   rows = await paginate_scalars(session, stmt.order_by(Model.name), limit=limit, offset=offset, response=response)


async def paginate_scalars(
    session: AsyncSession,
    stmt: Select,
    *,
    limit: int,
    offset: int,
    response: Response,
) -> Sequence:
    """Executes `stmt` (already filtered/ordered by the caller) with
    limit/offset applied, and sets `X-Total-Count` to the unbounded matching
    row count. Returns the ORM row objects for this page."""
    total = (
        await session.execute(select(func.count()).select_from(stmt.order_by(None).subquery()))
    ).scalar_one()
    response.headers["X-Total-Count"] = str(total)
    result: Result = await session.execute(stmt.limit(limit).offset(offset))
    return result.scalars().all()
