from unittest.mock import patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.routes.auth import auth_router, get_new_user
from backend.security import hash_password
from backend.storage import (
    InvalidEmailError,
    get_user_data_from_storage,
    get_user_data_path,
)


@pytest.fixture
def client() -> TestClient:
    app = FastAPI()
    app.include_router(auth_router)
    return TestClient(app)


def test_get_user_data_path_accepts_valid_email():
    path = get_user_data_path("alice@example.com")
    assert path.name == "alice@example.com.json"


@pytest.mark.parametrize(
    "email",
    [
        "../../tmp/evil",
        "..\\..\\tmp\\evil",
        "evil/../../x@example.com",
        "a/b@example.com",
        "a\\b@example.com",
        "..@example.com",
        "",
        "no-at-sign",
        "two words@example.com",
    ],
)
def test_get_user_data_path_rejects_invalid_emails(email: str):
    with pytest.raises(InvalidEmailError):
        get_user_data_path(email)


def test_get_new_user_falls_back_to_english_for_unknown_language():
    user = get_new_user("alice@example.com", "xx")  # type: ignore[arg-type]
    assert user.user_settings.name == "New user"


def test_register_is_disabled(client: TestClient):
    response = client.post(
        "/auth/register",
        data={"username": "alice@example.com", "password": "hunter2-strong"},
    )
    assert response.status_code == 403
    assert "disabled" in response.json()["detail"].lower()


def test_login_unknown_email_returns_401(client: TestClient):
    response = client.post(
        "/auth/login",
        data={"username": "nobody@example.com", "password": "hunter2"},
    )
    assert response.status_code == 401


def test_login_path_traversal_email_returns_401(client: TestClient):
    response = client.post(
        "/auth/login",
        data={"username": "../../tmp/evil", "password": "hunter2"},
    )
    assert response.status_code == 401


def test_provisioned_user_login_roundtrip(client: TestClient):
    creds = {"username": "bob@example.com", "password": "hunter2-strong"}
    user = get_new_user(
        creds["username"],
        "en",
        hashed_password=hash_password(creds["password"]),
    )
    user.save()

    response = client.post("/auth/login", data=creds)
    assert response.status_code == 200
    assert response.json()["access_token"]


def test_google_only_user_password_login_returns_401(client: TestClient):
    user = get_new_user("google-only@example.com", "en", hashed_password="")
    user.save()

    response = client.post(
        "/auth/login",
        data={"username": user.email, "password": "any-password"},
    )
    assert response.status_code == 401
    assert response.json()["detail"] == "Incorrect username or password"


@patch("backend.routes.auth.GOOGLE_CLIENT_ID", "test-google-client-id")
@patch("backend.routes.auth.verify_google_token")
def test_google_login_rejects_unprovisioned_user(
    mock_verify_google_token, client: TestClient
):
    mock_verify_google_token.return_value = {
        "email": "stranger@example.com",
        "sub": "google-sub-123",
    }
    response = client.post(
        "/auth/google",
        json={"token": "fake-token", "language": "en"},
    )
    assert response.status_code == 403
    assert response.json()["detail"] == "Account not provisioned"


@patch("backend.routes.auth.GOOGLE_CLIENT_ID", "test-google-client-id")
@patch("backend.routes.auth.verify_google_token")
def test_google_login_links_first_sign_in_for_google_only_user(
    mock_verify_google_token, client: TestClient
):
    email = "google-only@example.com"
    user = get_new_user(email, "en", hashed_password="")
    user.save()

    mock_verify_google_token.return_value = {
        "email": email,
        "sub": "google-sub-456",
    }
    response = client.post(
        "/auth/google",
        json={"token": "fake-token", "language": "en"},
    )
    assert response.status_code == 200
    assert response.json()["access_token"]

    saved = get_user_data_from_storage(email)
    assert saved.google_sub == "google-sub-456"


@patch("backend.routes.auth.GOOGLE_CLIENT_ID", "test-google-client-id")
@patch("backend.routes.auth.verify_google_token")
def test_google_login_applies_google_display_name(
    mock_verify_google_token, client: TestClient
):
    email = "named-google@example.com"
    user = get_new_user(email, "fr", hashed_password="")
    user.save()

    mock_verify_google_token.return_value = {
        "email": email,
        "sub": "google-sub-named",
        "name": "Kevin Dupont",
    }
    response = client.post(
        "/auth/google",
        json={"token": "fake-token", "language": "fr"},
    )
    assert response.status_code == 200

    saved = get_user_data_from_storage(email)
    assert saved.user_settings.name == "Kevin Dupont"
