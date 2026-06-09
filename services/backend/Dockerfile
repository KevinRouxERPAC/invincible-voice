FROM ghcr.io/astral-sh/uv:0.6.17-debian AS build
WORKDIR /app

ENV UV_COMPILE_BYTECODE=1 UV_LOCKED=1

RUN --mount=type=bind,source=uv.lock,target=uv.lock \
    --mount=type=bind,source=pyproject.toml,target=pyproject.toml \
    uv run --no-dev echo hello

COPY . .
ENV HOSTNAME="0.0.0.0"

HEALTHCHECK --start-period=15s \
    CMD curl --fail http://localhost:80/metrics || exit 1

FROM build AS prod
# Running through uvicorn directly to be able to deactive the Websocket per message deflate which is slowing
# down the replies by a few ms.
CMD ["uv", "run", "--no-dev", "uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "80", "--ws-per-message-deflate=false"]


FROM build AS hot-reloading
CMD ["uv", "run", "--no-dev", "uvicorn", "backend.main:app", "--reload", "--host", "0.0.0.0", "--port", "80", "--ws-per-message-deflate=false"]


# Cloud Run injects the listening port via $PORT (default 8080). Shell-form CMD
# so the variable is expanded at runtime.
FROM build AS cloudrun
ENV PORT=8080
CMD uv run --no-dev uvicorn backend.main:app --host 0.0.0.0 --port ${PORT} --ws-per-message-deflate=false
