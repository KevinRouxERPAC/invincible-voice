#!/usr/bin/env bash
set -euo pipefail

# Start the InvincibleVoice backend in text-only mode.
#
# This is meant to be run inside Termux (or a similar environment) on the
# phone, so that:
# - Android does STT/TTS locally
# - the backend only orchestrates LLM suggestions (no Opus/audio deps)
#
# Environment variables (minimum):
# - BACKEND_MODE=text_only
# - KYUTAI_LLM_URL=http://127.0.0.1:<LLM_PORT>/v1
# - KYUTAI_LLM_API_KEY=""  (can be empty for local servers)
# - KYUTAI_LLM_MODEL=<model-name>
# - KYUTAI_USERS_DATA_PATH=<writable path>
# - STT_IS_GRADIUM=false
# - KYUTAI_STT_URL=ws://unused
# - TTS_IS_GRADIUM=false
# - TTS_SERVER=http://unused
# - KYUTAI_API_KEY=<optional>
#
# Port:
# - BACKEND_PORT (default: 8800)

BACKEND_MODE="${BACKEND_MODE:-text_only}"
BACKEND_PORT="${BACKEND_PORT:-8800}"

export BACKEND_MODE

: "${KYUTAI_LLM_URL:?Missing KYUTAI_LLM_URL (e.g. http://127.0.0.1:8000/v1)}"
: "${KYUTAI_LLM_MODEL:?Missing KYUTAI_LLM_MODEL}"
: "${KYUTAI_USERS_DATA_PATH:?Missing KYUTAI_USERS_DATA_PATH}"

: "${KYUTAI_LLM_API_KEY:=}"
: "${STT_IS_GRADIUM:=false}"
: "${KYUTAI_STT_URL:=ws://unused}"
: "${TTS_IS_GRADIUM:=false}"
: "${TTS_SERVER:=http://unused}"

echo "Starting InvincibleVoice backend (text-only)"
echo "  BACKEND_MODE      : ${BACKEND_MODE}"
echo "  LLM URL           : ${KYUTAI_LLM_URL}"
echo "  LLM MODEL         : ${KYUTAI_LLM_MODEL}"
echo "  USERS_DATA_PATH  : ${KYUTAI_USERS_DATA_PATH}"
echo "  Port              : ${BACKEND_PORT}"

# Start the FastAPI server.
#
# The repository structure is:
#   services/backend/backend/main.py
# so run from services/backend and use python -m uvicorn.
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "${REPO_ROOT}/backend"

exec python -m uvicorn backend.main:app --host 127.0.0.1 --port "${BACKEND_PORT}"

