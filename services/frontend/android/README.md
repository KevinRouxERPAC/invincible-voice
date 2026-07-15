# Build Android (APK)

L'app Android est générée via [Capacitor](https://capacitorjs.com/) à partir du frontend Next.js exporté en statique. Elle embarque aussi un moteur **llama.cpp** compilé en natif (NDK) pour le mode 100% hors-ligne.

## Prérequis

- Android Studio (Hedgehog ou supérieur) avec le **NDK 27.2.12479018** (installable via le SDK Manager).
- CMake 3.22.1 (fourni par le SDK Manager).
- Node.js 20+ et pnpm.
- La variable `JAVA_HOME` pointe vers le JDK 21 (le wrapper Gradle utilise la toolchain JetBrains JBR 21).

## 1) Récupérer les sources de llama.cpp

Le dossier `app/src/main/cpp/llama.cpp/` est **volontairement gitignoré** (trop volumineux). À la première build, il faut le peupler :

```bash
# Depuis services/frontend
node scripts/fetch-llama-cpp.mjs
# ou une version pinnée :
node scripts/fetch-llama-cpp.mjs --ref b9900
```

Le script clone le tag `b9900` (par défaut) de [ggml-org/llama.cpp](https://github.com/ggml-org/llama.cpp) en shallow clone. Sans cette étape, la compilation CMake échouera sur `add_subdirectory(llama.cpp)`.

## 2) Construire le frontend et synchroniser Capacitor

```bash
# Depuis services/frontend
cp .env.android.example .env.android.local   # puis édite NEXT_PUBLIC_BACKEND_URL
pnpm build:android                           # = next build (export) + cap sync android
```

Pour le mode live-reload contre le dev server (sans rebuild statique) :

```bash
# Dans .env.android.local
CAPACITOR_SERVER_URL=http://192.168.1.42:3000
```

## 3) Compiler l'APK dans Android Studio

1. Ouvrir le dossier `services/frontend/android` dans Android Studio.
2. Laisser Gradle sync (téléchargement de la toolchain JDK 21 via foojay-resolver).
3. **Build → Make Project** (ou `./gradlew assembleDebug`).

Le build C++ tourne en Release même pour le debug APK (un build `-O0` de ggml est 10–50× plus lent). La cible est `arm64-v8a` uniquement.

## Architecture du mode offline

- **STT/TTS** : services natifs Android (`@capacitor-community/speech-recognition`, `@capacitor-community/text-to-speech`). Voir `src/utils/nativeSpeech.ts`.
- **LLM** : llama.cpp embarqué, exposé via le plugin Capacitor `LlamaCpp` (`LlamaCppPlugin.java` + pont JNI `llama-jni.cpp`). Le téléchargement du modèle GGUF se fait au premier lancement (`src/utils/modelManager.ts`).
- **Fallback hybride** : si le backend cloud est joignable, l'app l'utilise pour de meilleures suggestions ; sinon elle bascule sur le LLM local (`InvincibleVoice.tsx` → `preferLocal`).

## Problèmes courants

- **`No module named fastrtc`** côté backend en mode `text_only` : normal, les deps audio sont optionnelles. Le backend `text_only` fonctionne sans.
- **Build CMake lent / OOM** : llama.cpp est compilé avec `armv8.2-a+dotprod+i8mm+fp16`. Sur un émulateur x86_64 le binaire ne tournera pas — utilisez un appareil physique arm64 ou l'émulateur arm64.
- **Symlinks sur Windows** : la build `next build` standalone échoue sous Windows sans "Developer Mode" ou droits admin. Utilisez `NEXT_OUTPUT=export` (le mode Capacitor) qui ne crée pas de symlinks.
