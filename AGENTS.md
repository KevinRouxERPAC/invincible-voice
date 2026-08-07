# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

InvincibleVoice is a real-time voice communication system designed to help people who cannot speak communicate naturally. The core innovation: instead of having TTS read out whatever the LLM answers, the LLM provides multiple possible responses and the user selects which one to speak.

**Architecture** (cloud-only backend):
- Frontend: Next.js 15 + React 19 + TypeScript (PWA on Firebase Hosting, Android via Capacitor)
- Backend: FastAPI on **Google Cloud Run** (no local backend on developer machines)
- Key data flow: STT → LLM (generates 3 response options + 6 keywords) → User selection → TTS
- Default TTS voice: `d5HyIvCEW_x4BkDk`, French masculine, via Gradium
- Android app: Capacitor + llama.cpp (NDK) for on-device STT/TTS + offline LLM fallback

See `DEPLOYMENT.md` for Cloud Run + Firebase setup.

## Common Commands

### Frontend (cd services/frontend)
Point at Cloud Run via `.env.local` / `.env.production.local`:
```
NEXT_PUBLIC_BACKEND_URL=https://YOUR-SERVICE-xxxxx.run.app
```

```bash
pnpm install          # Install dependencies
pnpm dev              # Dev server (calls Cloud Run)
pnpm build            # Production build
pnpm build:export     # Static export (PWA / Capacitor)
pnpm lint             # Lint with ESLint (max-warnings 0)
pnpm test             # Run Jest tests
```

### Backend (cd services/backend) — code + tests only
Do **not** run a local API. Deploy with `gcloud run deploy` (see DEPLOYMENT.md).

```bash
uv sync               # Install dependencies
uv run pytest         # Run tests
uv run ruff check     # Lint
uv run ruff format    # Format
```

### Pre-commit Hooks (Root Directory)
```bash
uvx pre-commit install
uvx pre-commit run --all-files
```

## Architecture

### WebSocket Protocol
The application uses a custom protocol inspired by the OpenAI Realtime API, defined in `services/backend/backend/openai_realtime_api_events.py`:
- Client events: `input_audio_buffer.append`, `session.update`
- Server events: `response.text.delta`, `input_audio_buffer.speech_started`

### Key Components

#### Frontend
- `src/components/InvincibleVoice.tsx`: Main component, core WebSocket handler
- `src/hooks/useAudioProcessor.ts`: Audio streaming logic
- `src/utils/ttsCache.ts`: TTS response caching
- `src/auth/`: JWT-based authentication with Google OAuth

#### Backend (Cloud Run)
- `backend/unmute_handler.py`: Core WebSocket stream handler
- `backend/llm/`: LLM integration (OpenAI-compatible clients)
- `backend/stt/speech_to_text.py`: Speech-to-text (Gradium or Kyutai)
- `backend/routes/user.py`: User endpoints + WebSocket connection
- `backend/storage.py`: User data persistence (Cloud Storage mount)
- `backend/metrics.py`: Prometheus metrics

### Service Configuration
- `STT_IS_GRADIUM` / `TTS_IS_GRADIUM`: audio providers
- `KYUTAI_LLM_URL` / `KYUTAI_LLM_MODEL` / `KYUTAI_LLM_API_KEY`: LLM
- `GOOGLE_CLIENT_ID`: Web OAuth client ID (Android needs a separate Android OAuth client in Google Cloud Console)
- `NEXT_PUBLIC_BACKEND_URL`: Cloud Run URL for the frontend

### Testing
- Frontend: Jest in `services/frontend`
- Backend: `uv run pytest` in `services/backend`
- Manual QA checklist: `docs/QA-CHECKLIST.md`

## Contribution Guidelines

- No issue assignment: Anyone can work on any issue at any time
- PRs are squashed when merged
- Keep PRs small and focused for easier review
- Use `uv` for Python dependency management
