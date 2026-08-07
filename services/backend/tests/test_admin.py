import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.provisioning import get_new_user
from backend.routes.admin import admin_router
from backend.routes.user import user_router
from backend.security import create_access_token, hash_password


@pytest.fixture
def client() -> TestClient:
    app = FastAPI()
    app.include_router(user_router)
    app.include_router(admin_router)
    return TestClient(app)


def _auth_headers(email: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token({'sub': email})}"}


def _make_user(email: str, *, is_admin: bool = False) -> None:
    user = get_new_user(
        email,
        "fr",
        hashed_password=hash_password("password-long-enough"),
        is_admin=is_admin,
    )
    user.save()


def test_non_admin_cannot_list_users(client: TestClient):
    _make_user("user@example.com", is_admin=False)
    response = client.get("/v1/admin/users", headers=_auth_headers("user@example.com"))
    assert response.status_code == 403


def test_admin_can_list_users(client: TestClient):
    _make_user("admin@example.com", is_admin=True)
    _make_user("alice@example.com", is_admin=False)
    response = client.get("/v1/admin/users", headers=_auth_headers("admin@example.com"))
    assert response.status_code == 200
    emails = {item["email"] for item in response.json()}
    assert "admin@example.com" in emails
    assert "alice@example.com" in emails


def test_admin_can_create_user(client: TestClient):
    _make_user("admin@example.com", is_admin=True)
    response = client.post(
        "/v1/admin/users",
        headers=_auth_headers("admin@example.com"),
        json={
            "email": "new-user@example.com",
            "password": "password-long-enough",
            "language": "fr",
            "google_only": False,
            "is_admin": False,
        },
    )
    assert response.status_code == 200
    assert response.json()["email"] == "new-user@example.com"


def test_admin_cannot_delete_self(client: TestClient):
    _make_user("admin@example.com", is_admin=True)
    response = client.delete(
        "/v1/admin/users/admin@example.com",
        headers=_auth_headers("admin@example.com"),
    )
    assert response.status_code == 400


def test_bootstrap_admin_email_gets_admin_on_profile_load(
    client: TestClient, monkeypatch
):
    monkeypatch.setenv("ADMIN_EMAILS", "bootstrap@example.com")
    _make_user("bootstrap@example.com", is_admin=False)
    response = client.get("/v1/user/", headers=_auth_headers("bootstrap@example.com"))
    assert response.status_code == 200
    assert response.json()["is_admin"] is True


def test_bootstrap_admin_can_be_revoked(client: TestClient, monkeypatch):
    monkeypatch.setenv("ADMIN_EMAILS", "bootstrap@example.com")
    _make_user("admin@example.com", is_admin=True)
    _make_user("bootstrap@example.com", is_admin=False)

    client.get("/v1/user/", headers=_auth_headers("bootstrap@example.com"))

    revoke = client.patch(
        "/v1/admin/users/bootstrap@example.com",
        headers=_auth_headers("admin@example.com"),
        json={"is_admin": False},
    )
    assert revoke.status_code == 200
    assert revoke.json()["is_admin"] is False

    profile = client.get("/v1/user/", headers=_auth_headers("bootstrap@example.com"))
    assert profile.status_code == 200
    assert profile.json()["is_admin"] is False

    forbidden = client.get(
        "/v1/admin/users", headers=_auth_headers("bootstrap@example.com")
    )
    assert forbidden.status_code == 403
