import pytest

import backend.llm.llm_utils as llm_utils


class FakeDelta:
    def __init__(self, content: str):
        self.content = content


class FakeChoice:
    def __init__(self, content: str):
        self.delta = FakeDelta(content)


class FakeChunk:
    def __init__(self, content: str):
        self.choices = [FakeChoice(content)]


class FakeStream:
    def __init__(self, content: str):
        self._content = content
        self._yielded = False

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    def __aiter__(self):
        return self

    async def __anext__(self):
        if self._yielded:
            raise StopAsyncIteration
        self._yielded = True
        return FakeChunk(self._content)


@pytest.mark.asyncio
async def test_structured_output_fallback_retries_without_response_format(
    monkeypatch,
):
    calls: list[bool] = []

    async def fake_get_stream(self, messages, *, use_response_format: bool):
        calls.append(use_response_format)
        if use_response_format:
            raise Exception("response_format json_schema not supported")
        return FakeStream('{"suggested_answers":["OK"],"suggested_keywords":["kw1"]}')

    monkeypatch.setattr(llm_utils.VLLMStream, "get_stream", fake_get_stream)

    vllm = llm_utils.VLLMStream(
        client=object(),  # not used because we monkeypatch get_stream
        temperature=0.1,
    )

    tokens: list[str] = []
    async for token in vllm.chat_completion(
        messages=[{"role": "user", "content": "hi"}]
    ):
        tokens.append(token)

    assert calls[0] is True
    assert calls[-1] is False
    assert any("suggested_answers" in t for t in tokens)
