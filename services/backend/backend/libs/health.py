import os

import httpx

from backend.app_types import HealthStatus


async def _check_llm_up() -> bool:
    """
    Check quickly whether the configured LLM endpoint is reachable.

    This is intentionally a cheap "connectivity" check (no generation),
    used to prevent the frontend from attempting LLM/Cerebras calls when
    the user device has no Internet access.
    """

    llm_url = os.environ.get("KYUTAI_LLM_URL")
    if not llm_url:
        return False

    # For offline/local deployments, the LLM might:
    # - not require an API key
    # - expose either `/models` or `/v1/models`
    # - answer with 401/403/404 when the network path is still healthy
    llm_api_key = os.environ.get("KYUTAI_LLM_API_KEY", "").strip()

    base = llm_url.rstrip("/")

    # Candidate "read-only reachability" endpoints.
    # We avoid calling multiple endpoints on purpose (health must stay cheap),
    # but try the most common variants when needed.
    candidates: list[str] = [f"{base}/models"]
    if not base.lower().endswith("/v1"):
        candidates.append(f"{base}/v1/models")

    headers: dict[str, str] = {}
    if llm_api_key:
        headers["Authorization"] = f"Bearer {llm_api_key}"

    # Keep this check cheap and bounded so /v1/health stays responsive.
    timeout = httpx.Timeout(connect=1.5, read=1.5, write=1.0, pool=0.5)
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            for url in candidates:
                try:
                    resp = await client.get(url, headers=headers)
                except Exception:
                    continue

                # Any non-5xx response means the network path works.
                # (401/403 are usually "key required/invalid", not "server down".)
                if resp.status_code < 500:
                    return True
            return False
    except Exception:
        return False


async def get_health() -> HealthStatus:
    # STT health is not checked server-side because the Android client can
    # run STT offline on-device. Keep it up so /v1/health reflects mainly
    # the LLM availability (Cerebras) which drives paid/remote calls.
    stt_up = True
    llm_up = await _check_llm_up()
    return HealthStatus(
        stt_up=stt_up,
        llm_up=llm_up,
    )
