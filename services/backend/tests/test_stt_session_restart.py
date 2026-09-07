"""The STT provider caps a session's duration and closes the socket.

Gradium closes with `1008 Session exceeded maximum duration of 300 seconds`.
That exception used to travel up the TaskGroup and be reported as a fatal
error, so no conversation could last longer than five minutes: the app dropped
the user back to the home screen mid-sentence (production logs, 05-07/09/26).
The handler now opens a new session and carries on — but only while the
sessions look healthy, so a real outage still surfaces.
"""

import datetime as dt
import time
import uuid

import numpy as np
import pytest
import websockets

from backend.app_types import UserSettings
from backend.kyutai_constants import SAMPLE_RATE
from backend.storage import UserData

fastrtc = pytest.importorskip("fastrtc")  # audio deps optional; skip if absent
import backend.unmute_handler as unmute_mod  # noqa: E402
from backend.unmute_handler import (  # noqa: E402
    MIN_HEALTHY_STT_SESSION_SEC,
    UnmuteHandler,
)


class FakeSTT:
    """Stands in for a Gradium STT websocket session."""

    def __init__(self, expected_language: str | None = None):
        self.expected_language = expected_language
        self.sent_samples = 0
        self.closed = False
        self.fail_next_send = False

    async def start_up(self) -> None:
        pass

    def state(self) -> str:
        return "closed" if self.closed else "connected"

    async def send_audio(self, audio: np.ndarray) -> None:
        if self.fail_next_send:
            raise websockets.ConnectionClosedError(None, None)
        self.sent_samples += len(audio)

    async def shutdown(self) -> None:
        self.closed = True

    async def __aiter__(self):
        # A live session yields transcription messages; this one just stays
        # open until the quest is closed.
        while not self.closed:
            await _sleep_a_tick()
        if False:  # pragma: no cover - makes this an async generator
            yield None


async def _sleep_a_tick() -> None:
    import asyncio

    await asyncio.sleep(0.01)


def _make_handler(monkeypatch) -> tuple[UnmuteHandler, list[FakeSTT]]:
    created: list[FakeSTT] = []

    def _factory(expected_language: str | None = None) -> FakeSTT:
        stt = FakeSTT(expected_language)
        created.append(stt)
        return stt

    monkeypatch.setattr(unmute_mod, "SpeechToText", _factory)

    user_data = UserData(
        user_id=uuid.uuid4(),
        email="stt-restart-test@example.com",
        hashed_password=None,
        google_sub=None,
        user_settings=UserSettings(
            name="Alice",
            prompt="",
            additional_keywords=[],
            friends=[],
        ),
        conversations=[],
    )
    handler = UnmuteHandler(user_data, local_time=dt.datetime.now(dt.timezone.utc))
    return handler, created


def _frame() -> tuple[int, np.ndarray]:
    return SAMPLE_RATE, np.zeros((1, 480), dtype=np.float32)


@pytest.mark.asyncio
async def test_expired_session_is_replaced_and_the_conversation_continues(
    monkeypatch,
):
    handler, created = _make_handler(monkeypatch)

    async with handler:
        await handler.start_up_stt()
        assert len(created) == 1

        # The session has been running for a while and hits the provider's cap.
        handler._stt_started_at = time.monotonic() - 301
        handler.stt_last_message_time = 298.4
        created[0].fail_next_send = True

        # No exception: the user keeps talking.
        await handler.receive(_frame())

        assert len(created) == 2, "a new STT session should have been opened"
        assert created[0].closed, "the expired session should have been closed"
        assert handler.stt is created[1]

        # The new session restarts its clocks; a mark from the old timeline
        # would freeze pause detection for the rest of the call.
        assert handler.stt_last_message_time == 0
        assert handler.determine_pause() is False

        # Audio flows again through the new session.
        await handler.receive(_frame())
        assert created[1].sent_samples == 480


@pytest.mark.asyncio
async def test_sessions_dying_immediately_stop_being_retried(monkeypatch):
    handler, created = _make_handler(monkeypatch)

    async with handler:
        await handler.start_up_stt()

        # Every new session dies as soon as it is used: an outage, not the
        # duration cap. A few retries, then the error surfaces.
        for _ in range(unmute_mod.MAX_SHORT_LIVED_STT_RESTARTS):
            handler.stt.fail_next_send = True
            await handler.receive(_frame())

        assert len(created) == 1 + unmute_mod.MAX_SHORT_LIVED_STT_RESTARTS

        handler.stt.fail_next_send = True
        with pytest.raises(websockets.ConnectionClosed):
            await handler.receive(_frame())


@pytest.mark.asyncio
async def test_a_long_healthy_session_resets_the_failure_count(monkeypatch):
    handler, created = _make_handler(monkeypatch)

    async with handler:
        await handler.start_up_stt()

        handler._stt_short_lived_restarts = unmute_mod.MAX_SHORT_LIVED_STT_RESTARTS
        handler._stt_started_at = time.monotonic() - (MIN_HEALTHY_STT_SESSION_SEC + 1)
        handler.stt.fail_next_send = True

        await handler.receive(_frame())

        assert handler._stt_short_lived_restarts == 0
        assert len(created) == 2
