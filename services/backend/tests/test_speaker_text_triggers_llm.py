import asyncio
import datetime as dt
import uuid

import pytest

import backend.openai_realtime_api_events as ora
from backend.app_types import UserSettings
from backend.storage import UserData

fastrtc = pytest.importorskip("fastrtc")  # audio deps optional; skip if absent
import backend.unmute_handler as unmute_mod  # noqa: E402
from backend.unmute_handler import UnmuteHandler  # noqa: E402


@pytest.mark.asyncio
async def test_speaker_text_append_triggers_response_generation(monkeypatch):
    """
    When the client transcribes on-device, it sends `speaker.text.append`.
    The backend must consume it and start a new LLM suggestion run, emitting
    at least one `one.response` and one `one.keyword` event.
    """

    async def fake_chat_completion(self, messages):
        # Produce the structured JSON expected by `pydantic_core.from_json(...)`.
        yield ('{"suggested_answers":["Bonjour"],"suggested_keywords":["mot1","mot2"]}')

    monkeypatch.setattr(
        unmute_mod.VLLMStream,
        "chat_completion",
        fake_chat_completion,
    )

    user_data = UserData(
        user_id=uuid.uuid4(),
        email="stt-offline-test@example.com",
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

    handler = UnmuteHandler(
        user_data, local_time=dt.datetime.now(dt.timezone.utc), client_stt=True
    )

    async with handler:
        await handler.add_speaker_text(ora.SpeakerTextAppend(text="hello"))

        found_response = None
        found_keyword = None

        # The quest is fully async; drain the output queue until we see the
        # expected events (or timeout).
        for _ in range(20):
            item = await asyncio.wait_for(handler.output_queue.get(), timeout=2.0)

            if isinstance(item, ora.OneResponse) and item.content == "Bonjour":
                found_response = item
            elif isinstance(item, ora.OneKeyword) and item.content == "mot1":
                found_keyword = item

            if found_response is not None and found_keyword is not None:
                break

        assert found_response is not None
        assert found_keyword is not None
