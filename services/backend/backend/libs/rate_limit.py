"""Lightweight in-process rate limiting for sensitive endpoints.

The authentication routes are otherwise unprotected against brute force: with
``ALLOW_PASSWORD=true`` on a publicly reachable backend (e.g. Cloud Run with
``--allow-unauthenticated``), an attacker can try passwords as fast as the
server answers. Argon2 slows each attempt down but nothing caps the volume.

This module provides a sliding-window limiter keyed by ``(scope, client IP)``,
exposed as a FastAPI dependency. It is intentionally dependency-free and stored
in process memory:

- The vulnerable deployment (single-user Cloud Run, password enabled) runs a
  single instance, so per-process counting is exactly right.
- Multi-replica deployments disable password login, so per-process counting is
  acceptable defense-in-depth for the remaining endpoints.
"""

import threading
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request, status


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


def rate_limit(scope: str, max_requests: int, window_seconds: float):
    """Build a FastAPI dependency that enforces a per-IP rate limit.

    Args:
        scope: Logical bucket name, e.g. ``"auth-login"``. Different scopes are
            counted independently so one endpoint can't exhaust another's budget.
        max_requests: Maximum allowed requests within the window.
        window_seconds: Length of the sliding window, in seconds.
    """

    def dependency(request: Request) -> None:
        _limiter.check(scope, client_ip(request), max_requests, window_seconds)

    return dependency
