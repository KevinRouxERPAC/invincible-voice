"""Test E2E du chemin Android (client_stt=true) contre le backend déployé.

Reproduit exactement ce que fait l'app native : ouverture du WebSocket avec
le sous-protocole Bearer, envoi d'un événement speaker.text.append, lecture
des one.response / one.keyword générés par Cerebras.
"""

import asyncio
import datetime as dt
import json
import sys
import urllib.parse

import websockets

BACKEND = "wss://invincible-backend-s2y5qx44wa-ew.a.run.app"
TOKEN = sys.argv[1]


async def main() -> None:
    local_time = urllib.parse.quote(dt.datetime.now(dt.timezone.utc).isoformat())
    url = f"{BACKEND}/v1/user/new-conversation?local_time={local_time}&client_stt=true"
    async with websockets.connect(
        url,
        subprotocols=["realtime", f"Bearer.{TOKEN}"],
        additional_headers={"Origin": "https://localhost"},
        open_timeout=120,
    ) as ws:
        print("OPEN, subprotocol:", ws.subprotocol)
        await ws.send(
            json.dumps(
                {
                    "type": "speaker.text.append",
                    "text": "Bonjour, comment tu vas aujourd'hui ?",
                }
            )
        )
        deadline = asyncio.get_event_loop().time() + 30
        responses = 0
        while asyncio.get_event_loop().time() < deadline:
            try:
                raw = await asyncio.wait_for(ws.recv(), timeout=5)
            except asyncio.TimeoutError:
                continue
            event = json.loads(raw)
            etype = event.get("type")
            if etype in ("one.response", "one.keyword"):
                print(f"{etype}[{event.get('index')}]: {event.get('content')}")
                if etype == "one.response":
                    responses += 1
                if responses >= 3:
                    break
            else:
                print("event:", etype)
        print("DONE, responses:", responses)


asyncio.run(main())
