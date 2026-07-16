import pytest


class FakeResp:
    def __init__(self, status_code: int):
        self.status_code = status_code


@pytest.mark.asyncio
async def test_llm_health_no_api_key_allows_401(monkeypatch):
    """
    Offline/local OpenAI-compatible servers often reject missing auth
    with 401 but are still reachable (network path is OK).
    """
    from backend.libs import health as health_mod

    monkeypatch.setenv("KYUTAI_LLM_URL", "http://localhost:8091/v1")
    monkeypatch.delenv("KYUTAI_LLM_API_KEY", raising=False)

    requested: list[str] = []

    class FakeAsyncClient:
        def __init__(self, timeout=None):
            self.timeout = timeout

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def get(self, url: str, headers=None):
            requested.append(url)
            return FakeResp(401)

    monkeypatch.setattr(health_mod.httpx, "AsyncClient", FakeAsyncClient)

    assert await health_mod._check_llm_up() is True
    # When base ends with /v1, we only try /models (-> /v1/models).
    assert requested == ["http://localhost:8091/v1/models"]


@pytest.mark.asyncio
async def test_llm_health_tries_v1_models_when_models_404(monkeypatch):
    from backend.libs import health as health_mod

    monkeypatch.setenv("KYUTAI_LLM_URL", "http://localhost:8091")
    monkeypatch.delenv("KYUTAI_LLM_API_KEY", raising=False)

    class FakeAsyncClient:
        def __init__(self, timeout=None):
            self.timeout = timeout

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def get(self, url: str, headers=None):
            if url.endswith("/models"):
                return FakeResp(404)
            if url.endswith("/v1/models"):
                return FakeResp(200)
            return FakeResp(500)

    monkeypatch.setattr(health_mod.httpx, "AsyncClient", FakeAsyncClient)

    assert await health_mod._check_llm_up() is True


@pytest.mark.asyncio
async def test_llm_health_returns_false_when_all_candidates_5xx(monkeypatch):
    from backend.libs import health as health_mod

    monkeypatch.setenv("KYUTAI_LLM_URL", "http://localhost:8091")
    monkeypatch.delenv("KYUTAI_LLM_API_KEY", raising=False)

    class FakeAsyncClient:
        def __init__(self, timeout=None):
            self.timeout = timeout

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def get(self, url: str, headers=None):
            return FakeResp(503)

    monkeypatch.setattr(health_mod.httpx, "AsyncClient", FakeAsyncClient)

    assert await health_mod._check_llm_up() is False
