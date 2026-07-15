import asyncio
import datetime as dt
import uuid

import pytest

import backend.openai_realtime_api_events as ora
import backend.text_only_handler as text_only_mod
from backend.app_types import UserSettings
from backend.storage import UserData
from backend.text_only_handler import TextOnlyHandler


@pytest.mark.asyncio
async def test_text_only_speaker_text_append_triggers_one_response_and_keyword(
    monkeypatch,
):
    async def fake_chat_completion(self, messages):
        yield '{"suggested_answers":["Bonjour"],"suggested_keywords":["mot1","mot2"]}'

    monkeypatch.setattr(
        text_only_mod.VLLMStream,
        "chat_completion",
        fake_chat_completion,
    )

    user_data = UserData(
        user_id=uuid.uuid4(),
        email="text-only-handler@example.com",
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

    handler = TextOnlyHandler(user_data, local_time=dt.datetime.now(dt.timezone.utc))
    assert handler.audio_enabled is False

    async with handler:
        await handler.add_speaker_text(ora.SpeakerTextAppend(text="hello"))

        found_response = None
        found_keyword = None

        for _ in range(30):
            item = await asyncio.wait_for(handler.output_queue.get(), timeout=2.0)
            if isinstance(item, ora.OneResponse) and item.content == "Bonjour":
                found_response = item
            elif isinstance(item, ora.OneKeyword) and item.content == "mot1":
                found_keyword = item
            if found_response is not None and found_keyword is not None:
                break

        assert found_response is not None
        assert found_keyword is not None

