import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import backend.routes.user as user_routes
from backend.routes.user import user_router


@pytest.fixture
def client() -> TestClient:
    app = FastAPI()
    app.include_router(user_router)
    return TestClient(app)


def test_anonymous_route_closed_by_default(client: TestClient, monkeypatch):
    # Secure-by-default: without an explicit ALLOW_ANONYMOUS_USER=1, the shared
    # profile (settings + conversation history, de facto health data) must not
    # be readable without auth.
    monkeypatch.setattr(user_routes, "ALLOW_ANONYMOUS_USER", False)
    response = client.get("/v1/user/anonymous")
    assert response.status_code == 404


def test_anonymous_route_openable_for_private_deployments(
    client: TestClient, monkeypatch
):
    monkeypatch.setattr(user_routes, "ALLOW_ANONYMOUS_USER", True)
    response = client.get("/v1/user/anonymous")
    assert response.status_code == 200
    assert response.json()["email"] == "anonymous@invincible-voice.local"
