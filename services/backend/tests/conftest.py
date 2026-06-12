import os
import tempfile

# backend.kyutai_constants and backend.security read the environment at import
# time, so these must be set before any backend module is imported by the tests.
# KYUTAI_USERS_DATA_PATH is forced (not setdefault) so tests never touch real
# user data even if the variable is set in the developer's environment.
os.environ["KYUTAI_USERS_DATA_PATH"] = tempfile.mkdtemp(
    prefix="invincible-voice-tests-"
)

_TEST_ENV_DEFAULTS = {
    "STT_IS_GRADIUM": "false",
    "KYUTAI_STT_URL": "ws://localhost:8090",
    "TTS_IS_GRADIUM": "false",
    "TTS_SERVER": "ws://localhost:8089",
    "KYUTAI_LLM_API_KEY": "test-key",
    "KYUTAI_LLM_URL": "http://localhost:8091",
    "KYUTAI_LLM_MODEL": "test-model",
    "JWT_SECRET_KEY": "test-secret",
}
for _key, _value in _TEST_ENV_DEFAULTS.items():
    os.environ.setdefault(_key, _value)


import pytest  # noqa: E402  (must come after the env is set above)


@pytest.fixture(autouse=True)
def _reset_rate_limits():
    """Keep the in-process auth rate limiter from leaking state across tests."""
    from backend.libs.rate_limit import reset_rate_limits

    reset_rate_limits()
    yield
    reset_rate_limits()
