import datetime as dt

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from backend.app_types import Conversation, SpeakerMessage
from backend.routes.auth import get_new_user
from backend.routes.user import delete_conversation, user_router
from backend.security import create_access_token
from backend.storage import (
    MAX_PAST_CONVERSATIONS_IN_PROMPT,
    get_user_data_from_storage,
)


@pytest.fixture
def client() -> TestClient:
    app = FastAPI()
    app.include_router(user_router)
    return TestClient(app)


def _conversation(marker: str, when: dt.datetime) -> Conversation:
    return Conversation(
        messages=[SpeakerMessage(speaker="Friend", content=marker)],
        start_time=when,
    )


def _make_user(email: str, n_conversations: int):
    user = get_new_user(email, "en")
    base = dt.datetime(2025, 1, 1, tzinfo=dt.timezone.utc)
    # Delimited marker so MARKER(1) isn't a substring of MARKER(10), etc.
    user.conversations = [
        _conversation(f"ZMARK{i}Z", base + dt.timedelta(days=i))
        for i in range(n_conversations)
    ]
    user.save()
    return user


def _auth_headers(email: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token({'sub': email})}"}


# --- F6: delete_conversation index bounds -------------------------------------


def test_delete_out_of_range_returns_404(client: TestClient):
    email = "del-oob@example.com"
    _make_user(email, 2)
    response = client.delete("/v1/user/conversations/5", headers=_auth_headers(email))
    assert response.status_code == 404
    # Nothing was deleted.
    assert len(get_user_data_from_storage(email).conversations) == 2


def test_delete_valid_index_removes_one(client: TestClient):
    email = "del-ok@example.com"
    _make_user(email, 3)
    response = client.delete("/v1/user/conversations/0", headers=_auth_headers(email))
    assert response.status_code == 200
    assert len(get_user_data_from_storage(email).conversations) == 2


def test_delete_negative_index_guarded():
    # Starlette's int path convertor never matches a negative id, so exercise the
    # guard directly to prove it rejects rather than doing `del list[-1]`.
    user = _make_user("del-neg@example.com", 2)
    with pytest.raises(HTTPException) as exc:
        delete_conversation(-1, user)
    assert exc.value.status_code == 404
    assert len(user.conversations) == 2


# --- Archive conversation -----------------------------------------------------


def test_archive_sets_flag_without_deleting(client: TestClient):
    email = "arch-ok@example.com"
    _make_user(email, 3)
    response = client.patch(
        "/v1/user/conversations/1",
        json={"archived": True},
        headers=_auth_headers(email),
    )
    assert response.status_code == 200
    stored = get_user_data_from_storage(email)
    # Nothing deleted; only the flag flipped, and only on the target.
    assert len(stored.conversations) == 3
    assert stored.conversations[1].archived is True
    assert stored.conversations[0].archived is False
    assert stored.conversations[2].archived is False


def test_unarchive_flips_flag_back(client: TestClient):
    email = "arch-toggle@example.com"
    user = _make_user(email, 1)
    user.conversations[0].archived = True
    user.save()
    response = client.patch(
        "/v1/user/conversations/0",
        json={"archived": False},
        headers=_auth_headers(email),
    )
    assert response.status_code == 200
    assert get_user_data_from_storage(email).conversations[0].archived is False


def test_archive_out_of_range_returns_404(client: TestClient):
    email = "arch-oob@example.com"
    _make_user(email, 2)
    response = client.patch(
        "/v1/user/conversations/9",
        json={"archived": True},
        headers=_auth_headers(email),
    )
    assert response.status_code == 404


def test_archived_conversation_still_feeds_the_prompt():
    # Archiving is display-only: an archived conversation must still be replayed
    # into the LLM prompt so the user keeps "same tone, same knowledge".
    user = _make_user("arch-prompt@example.com", 2)
    user.conversations[0].archived = True
    user.save()

    messages = user.to_llm_ready_conversation(None, "M")
    prompt = messages[0].content
    assert "ZMARK0Z" in prompt
    assert "ZMARK1Z" in prompt


# --- FN1: bounded LLM context -------------------------------------------------


def test_prompt_caps_number_of_past_conversations():
    total = MAX_PAST_CONVERSATIONS_IN_PROMPT + 3
    user = _make_user("ctx@example.com", total)

    messages = user.to_llm_ready_conversation(None, "M")
    prompt = messages[0].content

    # Only the last (MAX + 1) conversations are kept: the oldest ones are dropped.
    assert "ZMARK0Z" not in prompt
    assert "ZMARK1Z" not in prompt
    # The most recent conversations are present.
    assert f"ZMARK{total - 1}Z" in prompt
    assert f"ZMARK{total - 2}Z" in prompt
