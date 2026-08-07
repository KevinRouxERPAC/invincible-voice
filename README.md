![logo](https://raw.githubusercontent.com/kyutai-labs/invincible-voice/refs/heads/main/images/logo.png)


InvincibleVoice is a real-time voice communication system
designed to help people who cannot speak communicate naturally with others. The
system uses speech-to-text (STT), large language model (LLM) and text-to-speech (TTS)
technologies to enable fluid conversations.

Get more context about this project on [our official page](https://www.invincible-voice.com/).

This is a fork of the [Kyutai InvincibleVoice project](https://github.com/kyutai-labs/invincible-voice), adapted for French-speaking users with ALS, featuring on-device STT/TTS via Android, offline LLM fallback via llama.cpp, and a Firebase + Cloud Run deployment.

## How it works

It is very similar to the [Unmute project](https://github.com/kyutai-labs/unmute); The main difference is that, instead of having the TTS reads out whatever the LLM answers, we ask the LLM to provide multiple possible answers and the TTS only utters the one selected by the user. This experimental system has more features than just this, in particular in the ways the LLM can be personnalized and the UI allows additional guidance of its answers, but this is the core idea.

## 🚀 Getting Started

**There is no local backend on your PC.** The API runs only on **Google Cloud Run**.

- Try the [deployed app](https://invinciblevoice-81c67.web.app)
- Full deploy guide: [`DEPLOYMENT.md`](DEPLOYMENT.md)

### Develop the frontend against Cloud Run

1. Deploy (or reuse) the backend on Cloud Run — see `DEPLOYMENT.md`.
2. Configure the frontend:

```powershell
cd services/frontend
Copy-Item .env.production.example .env.local
# Set NEXT_PUBLIC_BACKEND_URL=https://YOUR-SERVICE-xxxxx.run.app  (no /api suffix)
pnpm install
pnpm dev
```

3. Create users via **Paramètres → Administration** in the app (or `scripts/create_user.py` with `KYUTAI_USERS_DATA_PATH=gs://…`).

Root `.env` holds secrets used when deploying Cloud Run (Cerebras, Gradium, JWT, `GOOGLE_CLIENT_ID`, etc.). It is **not** used to start a local API.

### Android app: free on-device STT/TTS

The Capacitor Android app (`services/frontend/android`) does not use the
Gradium (or Kyutai) audio services at all. Instead it uses the phone's
built-in speech services, which are free and work offline once the language
packs are installed:

- **STT**: Android's `SpeechRecognizer`, via `@capacitor-community/speech-recognition`.
  The transcribed text is sent to the backend as `speaker.text.append`
  WebSocket events, and the client connects with `?client_stt=true` so the
  backend never opens a server-side STT connection. No audio leaves the phone.
- **TTS**: Android's text-to-speech engine, via `@capacitor-community/text-to-speech`.
  The backend `/v1/tts/` route is never called from the app (cloned voices are
  a web-only feature).

Only the LLM suggestions still go through Cloud Run. See `services/frontend/android/README.md`.

### Getting involved with the project

We welcome contributions from everyone! Whether you're a seasoned developer or new to open source, there are many ways to get involved. We recommend heading to [the issues page](https://github.com/kyutai-labs/invincible-voice/issues) to see what needs to be done. When we see that something is a good fit for the project, we'll tag it with the "Help wanted" label. Issues that can be done by newcomers will be tagged with the "Good first issue" label. Also don't hesitate to open issues yourself if you see something that could be improved or if you have ideas for new features.
