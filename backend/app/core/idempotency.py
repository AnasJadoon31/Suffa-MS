import json

from fastapi import Request
from fastapi.responses import JSONResponse, Response

from app.core.rate_limit import get_redis

IDEMPOTENCY_HEADER = "idempotency-key"
IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60  # generous: covers a queued offline mutation retrying over a day
MUTATION_METHODS = {"POST", "PUT", "PATCH", "DELETE"}


async def idempotency_guard(request: Request, call_next):
    """Deduplicates a mutation request replayed with the same `Idempotency-Key`
    header, e.g. the frontend's offline mutation queue resending an entry that
    already reached the server once (a client crash between the server
    committing and the client removing it from its local queue, or two tabs
    of the same PWA racing on the same queued entry).

    Purely opt-in: normal interactive requests never send this header, so
    this only ever engages for replayed offline mutations. Fails open if
    Redis is unreachable — same policy as app/core/rate_limit.py — since the
    request executing without dedup protection is exactly today's behavior,
    not a regression.
    """
    key = request.headers.get(IDEMPOTENCY_HEADER)
    if not key or request.method not in MUTATION_METHODS:
        return await call_next(request)

    tenant = request.headers.get("x-madrasa", "-")
    redis_key = f"idempotency:{tenant}:{key}"

    try:
        client = get_redis()
        claimed = await client.set(redis_key, "PENDING", nx=True, ex=IDEMPOTENCY_TTL_SECONDS)
    except Exception:
        return await call_next(request)

    if not claimed:
        try:
            cached = await client.get(redis_key)
        except Exception:
            cached = None
        if cached and cached != "PENDING":
            payload = json.loads(cached)
            return JSONResponse(status_code=payload["status"], content=payload["body"])
        # Another request with this exact key is still in flight right now
        # (most likely a second tab). The client's own retry/backoff picks
        # this up on the next flush pass, by which point the in-flight
        # request will have cached its real outcome above.
        return JSONResponse(
            status_code=409,
            content={"detail": "A request with this idempotency key is already being processed"},
        )

    response = await call_next(request)

    if not (200 <= response.status_code < 300):
        # Don't cache failures — a legitimate retry (e.g. after a transient
        # error) should actually re-attempt, not replay the same failure.
        try:
            await client.delete(redis_key)
        except Exception:
            pass
        return response

    body = b"".join([chunk async for chunk in response.body_iterator])
    try:
        parsed_body = json.loads(body) if body else None
        await client.set(
            redis_key,
            json.dumps({"status": response.status_code, "body": parsed_body}),
            ex=IDEMPOTENCY_TTL_SECONDS,
        )
    except (json.JSONDecodeError, TypeError):
        # Non-JSON success body: nothing sane to replay, so don't pretend to
        # guard this key — let a retry hit the real handler again.
        try:
            await client.delete(redis_key)
        except Exception:
            pass
    except Exception:
        pass

    headers = dict(response.headers)
    headers.pop("content-length", None)
    return Response(
        content=body,
        status_code=response.status_code,
        headers=headers,
        media_type=response.media_type,
    )
