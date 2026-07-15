# Termux: backend 100% local (Android STT/TTS) + LLM local

Ce guide vise le mode **“offline strict sur téléphone”** :
- STT et TTS : via les services natifs Android (déjà câblés dans l’app).
- Backend : en **mode `text_only`** (il ne fait que lancer le LLM et renvoyer les `one.response` / `one.keyword`).
- LLM : via un serveur OpenAI-compatible local (ex. `llama.cpp`).

## 1) Prérequis
- Termux fonctionnel sur le téléphone.
- Un serveur LLM local OpenAI-compatible (recommandé : `llama.cpp`).
- `redis-server` (le backend utilise un lock Redis).
- Un environnement Python avec `uvicorn` (le script lance `python -m uvicorn ...`).

## 2) Démarrer le LLM (exemple llama.cpp)
1. Compile/démarre `llama.cpp` sur la machine du téléphone.
2. Lance `llama-server` avec un modèle quantifié :

```bash
export LLAMA_MODEL=/sdcard/Download/model.gguf
export LLAMA_PORT=8000
bash run-llm-llama-cpp.sh
```

Le serveur expose généralement :
- `POST /v1/chat/completions`

## 3) Démarrer le backend (text-only)
Dans Termux, lance :

```bash
export BACKEND_MODE=text_only
export BACKEND_PORT=8800

# Le backend attend un endpoint OpenAI-compatible "v1" :
export KYUTAI_LLM_URL=http://127.0.0.1:8000/v1
export KYUTAI_LLM_MODEL=local-model
export KYUTAI_LLM_API_KEY=""   # peut être vide si ton serveur n'authentifie pas

# IMPORTANT : chemin local en écriture :
export KYUTAI_USERS_DATA_PATH=/data/data/com.termux/files/home/invinciblevoice-data

export STT_IS_GRADIUM=false
export KYUTAI_STT_URL=ws://unused
export TTS_IS_GRADIUM=false
export TTS_SERVER=http://unused
export KYUTAI_API_KEY=""       # optionnel

# Installe/active uvicorn si besoin, puis :
bash run-text-only-backend.sh
```

## 4) Configurer l’app Android (frontend)
Le backend doit être joignable depuis l’émulateur/téléphone.

Pour le téléphone (backend sur le même téléphone) :
- `NEXT_PUBLIC_BACKEND_URL=http://127.0.0.1:8800/api`

Pour l’émulateur (si tu exécutes le backend ailleurs) :
- `NEXT_PUBLIC_BACKEND_URL=http://10.0.2.2:8800/api`

## 5) Checklist “offline strict”
1. Couper l’Internet mobile + Wi‑Fi.
2. Ouvrir l’app.
3. Vérifier que la conversation n’affiche pas “Mode secours”.
4. Parler : tu dois voir les `one.response` / `one.keyword`.

