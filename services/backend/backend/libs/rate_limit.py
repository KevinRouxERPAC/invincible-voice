"""Rate limiting for sensitive endpoints.

The authentication routes are otherwise unprotected against brute force: with
``ALLOW_PASSWORD=true`` on a publicly reachable backend (e.g. Cloud Run with
``--allow-unauthenticated``), an attacker can try passwords as fast as the
server answers. Argon2 slows each attempt down but nothing caps the volume.

This module provides a sliding-window limiter keyed by ``(scope, client IP)``,
exposed as a FastAPI dependency. Two backends are available:

- **In-process** (default): a dependency-free counter stored in process memory.
  Exact on a single instance; on a multi-replica deployment each replica counts
  independently, so the effective budget is multiplied by the replica count.
  Acceptable defense-in-depth, but not a hard cap.
- **Redis** (opt-in via ``RATE_LIMIT_USE_REDIS=true``): a sliding window stored
  in Redis (reusing the same ``REDIS_URL`` as the TTS/STT locks), shared across
  replicas so the budget is enforced globally. If Redis is unreachable the
  limiter *fails open onto the in-process counter* — a Redis outage degrades the
  guarantee but never locks every user out of authentication.
"""

import logging
import os
import threading
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request, status

logger = logging.getLogger(__name__)


def client_ip(request: Request) -> str:
    """Best-effort original client IP.

    Behind Cloud Run / Traefik the socket peer is the proxy, so prefer the
    first hop in ``X-Forwarded-For`` (the original client) when present.
    """
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        first = forwarded.split(",")[0].strip()
        if first:
            return first
    if request.client is not None:
        return request.client.host
    return "unknown"


class SlidingWindowRateLimiter:
    """Thread-safe sliding-window counter keyed by ``(scope, ip)``."""

    def __init__(self) -> None:
        self._hits: dict[tuple[str, str], deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def check(
        self, scope: str, ip: str, max_requests: int, window_seconds: float
    ) -> None:
        """Record a hit and raise 429 if the window budget is exceeded."""
        now = time.monotonic()
        cutoff = now - window_seconds
        key = (scope, ip)
        with self._lock:
            hits = self._hits[key]
            while hits and hits[0] < cutoff:
                hits.popleft()
            if len(hits) >= max_requests:
                retry_after = max(1, int(hits[0] + window_seconds - now))
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="Too many attempts. Please wait and try again.",
                    headers={"Retry-After": str(retry_after)},
                )
            hits.append(now)

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()


_limiter = SlidingWindowRateLimiter()


def reset_rate_limits() -> None:
    """Clear all recorded hits. Intended for tests."""
    _limiter.reset()


def _redis_enabled() -> bool:
    return os.getenv("RATE_LIMIT_USE_REDIS", "false").lower() in ("1", "true")


def _redis_url() -> str:
    return os.getenv("REDIS_URL") or (
        f"redis://{os.getenv('REDIS_HOST', 'localhost')}:"
        f"{os.getenv('REDIS_PORT', '6379')}"
    )


# Lazily created synchronous Redis client. The auth endpoints are sync ``def``
# functions (FastAPI runs them in a threadpool), so a synchronous client keeps
# the limiter a plain blocking call rather than dragging async into the route.
_redis_client = None
_redis_unavailable = False


def _get_redis():
    """Return a connected Redis client, or ``None`` if Redis can't be reached.

    The result of a failed connection is cached so we don't pay a connection
    timeout on every request once Redis is known to be down.
    """
    global _redis_client, _redis_unavailable
    if _redis_unavailable:
        return None
    if _redis_client is None:
        try:
            import redis  # imported lazily; only needed when the backend is on

            _redis_client = redis.Redis.from_url(
                _redis_url(),
                socket_connect_timeout=0.5,
                socket_timeout=0.5,
            )
        except Exception as exc:  # pragma: no cover - defensive
            logger.warning(
                "Redis rate-limit backend unavailable, using in-process counter: %s",
                exc,
            )
            _redis_unavailable = True
            return None
    return _redis_client


def _check_redis(scope: str, ip: str, max_requests: int, window_seconds: float) -> bool:
    """Enforce the sliding window in Redis.

    Returns ``True`` when the request was counted by Redis (and allowed), raises
    429 when the budget is exceeded, and returns ``False`` when Redis is
    unreachable so the caller can fall back to the in-process counter.
    """
    client = _get_redis()
    if client is None:
        return False

    key = f"ratelimit:{scope}:{ip}"
    now = time.time()
    cutoff = now - window_seconds
    try:
        pipe = client.pipeline()
        pipe.zremrangebyscore(key, 0, cutoff)
        pipe.zcard(key)
        _, current = pipe.execute()
    except Exception as exc:
        logger.warning("Redis rate-limit check failed, falling back: %s", exc)
        return False

    if current >= max_requests:
        retry_after = window_seconds
        try:
            oldest = client.zrange(key, 0, 0, withscores=True)
            if oldest:
                retry_after = oldest[0][1] + window_seconds - now
        except Exception:  # pragma: no cover - best-effort Retry-After only
            pass
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many attempts. Please wait and try again.",
            headers={"Retry-After": str(max(1, int(retry_after)))},
        )

    try:
        # The member must be unique so concurrent requests at the same instant
        # don't collapse into a single sorted-set entry.
        member = f"{now}:{os.urandom(6).hex()}"
        pipe = client.pipeline()
        pipe.zadd(key, {member: now})
        pipe.expire(key, int(window_seconds) + 1)
        pipe.execute()
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning(
            "Redis rate-limit record failed (request still allowed): %s", exc
        )
    return True


def rate_limit(scope: str, max_requests: int, window_seconds: float):
    """Build a FastAPI dependency that enforces a per-IP rate limit.

    Args:
        scope: Logical bucket name, e.g. ``"auth-login"``. Different scopes are
            counted independently so one endpoint can't exhaust another's budget.
        max_requests: Maximum allowed requests within the window.
        window_seconds: Length of the sliding window, in seconds.
    """

    def dependency(request: Request) -> None:
        ip = client_ip(request)
        if _redis_enabled() and _check_redis(scope, ip, max_requests, window_seconds):
            return
        # Redis disabled or unreachable: in-process counter (also the default).
        _limiter.check(scope, ip, max_requests, window_seconds)

    return dependency
