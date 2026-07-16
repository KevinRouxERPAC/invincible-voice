import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.routes.auth import auth_router, get_new_user
from backend.storage import InvalidEmailError, get_user_data_path


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


def test_register_rejects_path_traversal_email(client: TestClient):
    response = client.post(
        "/auth/register",
        params={"language": "fr"},
        data={"username": "../../tmp/evil", "password": "hunter2"},
    )
    assert response.status_code == 400


def test_register_rejects_unsupported_language(client: TestClient):
    response = client.post(
        "/auth/register",
        params={"language": "xx"},
        data={"username": "alice@example.com", "password": "hunter2"},
    )
    assert response.status_code == 422


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


def test_register_then_login_roundtrip(client: TestClient):
    creds = {"username": "bob@example.com", "password": "hunter2-strong"}
    response = client.post("/auth/register", params={"language": "en"}, data=creds)
    assert response.status_code == 200

    response = client.post("/auth/login", data=creds)
    assert response.status_code == 200
    assert response.json()["access_token"]


def test_register_rejects_short_password(client: TestClient):
    response = client.post(
        "/auth/register",
        params={"language": "en"},
        data={"username": "short@example.com", "password": "hunter2"},
    )
    assert response.status_code == 400
    assert "at least 10 characters" in response.json()["detail"]
