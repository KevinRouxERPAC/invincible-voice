#!/usr/bin/env bash
set -euo pipefail

# Start a llama.cpp OpenAI-compatible server.
#
# Requirements (outside this script):
# - You have built llama.cpp and have `llama-server`
# - You have a quantized .gguf model downloaded
#
# Suggested usage:
#   export LLAMA_MODEL=/sdcard/Download/model.gguf
#   export LLAMA_PORT=8000
#   bash run-llm-llama-cpp.sh

LLAMA_MODEL="${LLAMA_MODEL:-}"
LLAMA_PORT="${LLAMA_PORT:-8000}"
LLAMA_HOST="${LLAMA_HOST:-127.0.0.1}"

if [[ -z "${LLAMA_MODEL}" ]]; then
  echo "Missing LLAMA_MODEL (path to .gguf). Example:"
  echo "  export LLAMA_MODEL=/sdcard/Download/model.gguf"
  exit 1
fi

echo "Starting llama.cpp server:"
echo "  model: ${LLAMA_MODEL}"
echo "  host : ${LLAMA_HOST}"
echo "  port : ${LLAMA_PORT}"

# OpenAI-compatible endpoint is enabled by default for llama-server:
#   POST /v1/chat/completions
# No `--api` flag required.
#
# If your build requires a different binary name/path, adjust here.
exec ./llama-server \
  -m "${LLAMA_MODEL}" \
  --host "${LLAMA_HOST}" \
  --port "${LLAMA_PORT}"

