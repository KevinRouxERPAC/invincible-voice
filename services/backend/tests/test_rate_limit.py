import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.libs.rate_limit import (
    SlidingWindowRateLimiter,
    rate_limit,
    reset_rate_limits,
)
from backend.routes.auth import auth_router


@pytest.fixture
def client() -> TestClient:
    app = FastAPI()
    app.include_router(auth_router)
    return TestClient(app)


def test_limiter_allows_up_to_budget_then_blocks():
    limiter = SlidingWindowRateLimiter()
    for _ in range(3):
        limiter.check("scope", "1.2.3.4", max_requests=3, window_seconds=60)
    with pytest.raises(Exception) as exc:
        limiter.check("scope", "1.2.3.4", max_requests=3, window_seconds=60)
    assert getattr(exc.value, "status_code", None) == 429


def test_limiter_isolates_by_ip_and_scope():
    limiter = SlidingWindowRateLimiter()
    limiter.check("a", "1.1.1.1", max_requests=1, window_seconds=60)
    # Different IP, same scope: still allowed.
    limiter.check("a", "2.2.2.2", max_requests=1, window_seconds=60)
    # Same IP, different scope: still allowed.
    limiter.check("b", "1.1.1.1", max_requests=1, window_seconds=60)
    # Same IP and scope again: blocked.
    with pytest.raises(Exception) as exc:
        limiter.check("a", "1.1.1.1", max_requests=1, window_seconds=60)
    assert getattr(exc.value, "status_code", None) == 429


def test_login_endpoint_returns_429_after_many_attempts(client: TestClient):
    reset_rate_limits()
    # The default budget is 10/min; the 11th attempt within the window is blocked.
    last_status = None
    for _ in range(12):
        response = client.post(
            "/auth/login",
            data={"username": "nobody@example.com", "password": "wrong"},
        )
        last_status = response.status_code
    assert last_status == 429


def test_rate_limit_dependency_keys_on_forwarded_for():
    dep = rate_limit("fwd", max_requests=1, window_seconds=60)

    class _Req:
        def __init__(self, xff):
            self.headers = {"x-forwarded-for": xff}
            self.client = None

    # Same forwarded client is rate limited on the second call.
    dep(_Req("9.9.9.9, 10.0.0.1"))  # type: ignore[arg-type]
    with pytest.raises(Exception) as exc:
        dep(_Req("9.9.9.9, 10.0.0.1"))  # type: ignore[arg-type]
    assert getattr(exc.value, "status_code", None) == 429
