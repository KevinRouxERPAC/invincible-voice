import pytest

import backend.libs.websockets as websockets_mod
from backend.app_types import HealthStatus


class FakeWebSocket:
    def __init__(self):
        self.closed = None

    async def close(self, code=None, reason=None):
        self.closed = {"code": code, "reason": reason}


@pytest.mark.asyncio
async def test_websocket_route_closes_when_health_not_ok(monkeypatch):
    async def fake_get_health():
        return HealthStatus(stt_up=True, llm_up=False)

    monkeypatch.setattr(websockets_mod, "get_health", fake_get_health)

    ws = FakeWebSocket()
    await websockets_mod.run_route(ws, handler=None)  # type: ignore[arg-type]

    assert ws.closed is not None
    assert ws.closed["code"] == websockets_mod.status.WS_1011_INTERNAL_ERROR
    assert "not healthy" in ws.closed["reason"]


@pytest.mark.asyncio
async def test_websocket_route_keeps_running_when_health_ok(monkeypatch):
    async def fake_get_health():
        return HealthStatus(stt_up=True, llm_up=True)

    async def fake_receive_loop(*args, **kwargs):
        return None

    async def fake_emit_loop(*args, **kwargs):
        return None

    async def fake_debug_running_tasks():
        return None

    monkeypatch.setattr(websockets_mod, "get_health", fake_get_health)
    monkeypatch.setattr(websockets_mod, "receive_loop", fake_receive_loop)
    monkeypatch.setattr(websockets_mod, "emit_loop", fake_emit_loop)
    monkeypatch.setattr(websockets_mod, "debug_running_tasks", fake_debug_running_tasks)

    class DummyQuestManager:
        async def wait(self):
            return None

    class DummyHandler:
        def __init__(self):
            self.quest_manager = DummyQuestManager()

        async def cleanup(self):
            return None

    ws = FakeWebSocket()
    await websockets_mod.run_route(ws, handler=DummyHandler())  # type: ignore[arg-type]

    assert ws.closed is None
