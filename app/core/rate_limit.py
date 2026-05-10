"""In-memory token-bucket rate limiter exposed as FastAPI dependencies."""
from __future__ import annotations

import asyncio
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.config import get_settings
from app.core.observability import record_rate_limit_rejection, user_id_var
from app.core.security import decode_access_token


@dataclass
class _Bucket:
    tokens: float
    last_refill: float


class RateLimiter:
    def __init__(self) -> None:
        self._buckets: dict[tuple[str, str], _Bucket] = {}
        self._lock = asyncio.Lock()

    async def consume(
        self,
        bucket: str,
        key: str,
        capacity: int,
        refill_per_sec: float,
    ) -> tuple[bool, float]:
        now = time.monotonic()
        async with self._lock:
            entry = self._buckets.get((bucket, key))
            if entry is None:
                entry = _Bucket(tokens=float(capacity), last_refill=now)
                self._buckets[(bucket, key)] = entry
            elapsed = now - entry.last_refill
            entry.tokens = min(float(capacity), entry.tokens + elapsed * refill_per_sec)
            entry.last_refill = now
            if entry.tokens >= 1.0:
                entry.tokens -= 1.0
                return True, 0.0
            missing = 1.0 - entry.tokens
            retry_after = missing / refill_per_sec if refill_per_sec > 0 else 60.0
            return False, retry_after


_limiter = RateLimiter()
_optional_bearer = HTTPBearer(auto_error=False)


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _reject(bucket: str, retry_after: float) -> None:
    record_rate_limit_rejection(bucket)
    raise HTTPException(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        detail="Rate limit exceeded.",
        headers={"Retry-After": str(max(1, int(retry_after) + 1))},
    )


def rate_limit_user(bucket: str, per_minute: int) -> Callable[..., Awaitable[None]]:
    """Per-user (or per-IP fallback) rate limit. `per_minute` controls both burst and refill."""

    capacity = per_minute
    refill_per_sec = per_minute / 60.0

    async def dep(
        request: Request,
        credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_optional_bearer)],
    ) -> None:
        settings = get_settings()
        if not settings.rate_limit_enabled:
            return
        key: str
        if credentials is not None:
            try:
                user_id = decode_access_token(credentials.credentials)
                key = f"u:{user_id}"
                user_id_var.set(str(user_id))
            except jwt.PyJWTError:
                key = f"ip:{_client_ip(request)}"
        else:
            key = f"ip:{_client_ip(request)}"
        allowed, retry_after = await _limiter.consume(bucket, key, capacity, refill_per_sec)
        if not allowed:
            _reject(bucket, retry_after)

    return dep


def rate_limit_ip(bucket: str, per_minute: int) -> Callable[..., Awaitable[None]]:
    """Per-IP rate limit, for unauthenticated routes (login, register, oauth)."""

    capacity = per_minute
    refill_per_sec = per_minute / 60.0

    async def dep(request: Request) -> None:
        settings = get_settings()
        if not settings.rate_limit_enabled:
            return
        key = f"ip:{_client_ip(request)}"
        allowed, retry_after = await _limiter.consume(bucket, key, capacity, refill_per_sec)
        if not allowed:
            _reject(bucket, retry_after)

    return dep
