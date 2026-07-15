// On-device speech services for the Capacitor (Android) app.
//
// In the native app we use the phone's built-in speech recognizer and TTS
// engine instead of the backend's Gradium STT/TTS. This makes conversations
// free of any per-second/per-character API cost and keeps working offline
// (with the language packs installed). The backend is still used for the LLM
// suggestions: the transcribed text is sent over the existing WebSocket as
// `speaker.text.append` events.
import { SpeechRecognition } from '@capacitor-community/speech-recognition';
import {
  TextToSpeech,
  QueueStrategy,
} from '@capacitor-community/text-to-speech';
import { isNativeApp } from '@/utils/platform';

/**
 * Map the app's transcription language setting (short code or null) to a
 * BCP-47 tag the Android recognizer/TTS understands.
 */
export function toBcp47(language: string | null | undefined): string {
  const fallback =
    typeof navigator !== 'undefined' ? navigator.language : 'fr-FR';
  if (!language) {
    return fallback;
  }
  if (language.includes('-')) {
    return language;
  }
  const map: Record<string, string> = {
    fr: 'fr-FR',
    en: 'en-US',
    de: 'de-DE',
    es: 'es-ES',
    it: 'it-IT',
    pt: 'pt-PT',
    nl: 'nl-NL',
  };
  return map[language.toLowerCase()] ?? fallback;
}

export interface NativeListeningOptions {
  /** BCP-47 tag, e.g. 'fr-FR'. */
  language: string;
  /** Live partial transcription of the current utterance (full text so far). */
  onPartial: (text: string) => void;
  /** A finished utterance, ready to be sent to the backend. */
  onUtterance: (text: string) => void;
  onError?: (error: unknown) => void;
}

export interface NativeListeningController {
  stop: () => Promise<void>;
}

// Module-level state so TTS can pause recognition while the phone speaks:
// otherwise the microphone picks up our own synthesized voice and it comes
// back as speaker text (echo).
let activeListening: {
  suspend: () => Promise<void>;
  resume: () => void;
} | null = null;

/**
 * Whether native speech recognition is usable on this device.
 */
export async function isNativeSpeechAvailable(): Promise<boolean> {
  if (!isNativeApp()) {
    return false;
  }
  try {
    const { available } = await SpeechRecognition.available();
    return available;
  } catch {
    return false;
  }
}

/**
 * Ask for the RECORD_AUDIO / speech recognition permission.
 */
export async function requestNativeSpeechPermission(): Promise<boolean> {
  try {
    const status = await SpeechRecognition.requestPermissions();
    return status.speechRecognition === 'granted';
  } catch {
    return false;
  }
}

/**
 * Listen continuously with the phone's speech recognizer.
 *
 * The Android recognizer works utterance by utterance: it stops by itself
 * after a silence. We restart it every time it stops, so from the caller's
 * point of view this is continuous listening until `stop()` is called.
 */
export async function startNativeListening(
  options: NativeListeningOptions,
): Promise<NativeListeningController> {
  const { language, onPartial, onUtterance, onError } = options;

  let active = true;
  let suspended = false;
  let lastPartial = '';
  // True only between a started recognition session and its 'stopped' event.
  // Android flushes a final `partialResults` *after* 'stopped'; without this
  // guard that late result is re-attributed to the next session and the
  // utterance gets committed (and generated) twice.
  let sessionActive = false;
  let restartTimer: ReturnType<typeof setTimeout> | null = null;

  const commitUtterance = () => {
    const text = lastPartial.trim();
    lastPartial = '';
    if (text) {
      onUtterance(text);
    }
  };

  const startOnce = async () => {
    if (!active || suspended) {
      return;
    }
    try {
      // With partialResults, start() resolves immediately; results arrive
      // through the listeners below.
      sessionActive = true;
      await SpeechRecognition.start({
        language,
        maxResults: 1,
        partialResults: true,
        popup: false,
      });
    } catch (e) {
      sessionActive = false;
      onError?.(e);
    }
  };

  const scheduleRestart = (delayMs: number) => {
    if (restartTimer) {
      clearTimeout(restartTimer);
    }
    restartTimer = setTimeout(() => {
      restartTimer = null;
      startOnce().catch((e) => onError?.(e));
    }, delayMs);
  };

  await SpeechRecognition.removeAllListeners();

  await SpeechRecognition.addListener('partialResults', ({ matches }) => {
    // Ignore results that arrive when no session is running: Android emits a
    // trailing final result just after 'stopped', which would otherwise be
    // committed as a second (duplicate) utterance on the next cycle.
    if (!active || suspended || !sessionActive) {
      return;
    }
    if (matches && matches.length > 0 && matches[0]) {
      [lastPartial] = matches;
      onPartial(lastPartial);
    }
  });

  await SpeechRecognition.addListener('listeningState', ({ status }) => {
    if (!active) {
      return;
    }
    if (status === 'stopped') {
      // Utterance finished (silence, error or deliberate stop): the session is
      // over, so any further partial results belong to nothing. Commit what we
      // heard and, unless we're suspended, listen again.
      sessionActive = false;
      commitUtterance();
      if (!suspended) {
        scheduleRestart(150);
      }
    }
  });

  // Safety net: Android occasionally drops the recognizer without a clean
  // 'stopped' event (e.g. ERROR_NO_MATCH after a long silence). Check
  // periodically and restart when needed.
  const watchdog = setInterval(() => {
    if (!active || suspended) {
      return;
    }
    SpeechRecognition.isListening()
      .then(({ listening }) => {
        if (!listening && active && !suspended && restartTimer === null) {
          scheduleRestart(0);
        }
      })
      .catch(() => {});
  }, 2000);

  activeListening = {
    suspend: async () => {
      suspended = true;
      try {
        // stop() can hang forever when the recognizer already died on its own
        // (e.g. right after a NO_MATCH error): its promise then never settles.
        // suspend() is awaited by speakNative() BEFORE speaking, so a stuck
        // stop would silence every TTS output during a conversation — the
        // app's core purpose. `suspended` is already true, which keeps the
        // restart loop quiet, so racing a short timeout is always safe.
        await Promise.race([
          SpeechRecognition.stop(),
          new Promise<void>((resolve) => {
            setTimeout(resolve, 800);
          }),
        ]);
      } catch {
        // Already stopped: fine.
      }
    },
    resume: () => {
      if (!active) {
        return;
      }
      suspended = false;
      scheduleRestart(300);
    },
  };

  await startOnce();

  return {
    stop: async () => {
      active = false;
      activeListening = null;
      clearInterval(watchdog);
      if (restartTimer) {
        clearTimeout(restartTimer);
        restartTimer = null;
      }
      try {
        await SpeechRecognition.stop();
      } catch {
        // Already stopped: fine.
      }
      await SpeechRecognition.removeAllListeners();
    },
  };
}

export interface NativeSpeakOptions {
  text: string;
  /** Used for the `tts-playback-state` events the UI listens to. */
  messageId: string;
  /** Speech rate multiplier, 1.0 = normal. */
  rate?: number;
  /** BCP-47 tag, e.g. 'fr-FR'. Defaults to the device language. */
  lang?: string;
}

/**
 * Speak with the phone's TTS engine, mirroring playTTSStream's
 * `tts-playback-state` window events so the UI shows the playing state.
 *
 * Recognition is suspended while speaking so the microphone doesn't
 * transcribe our own voice.
 */
export async function speakNative(options: NativeSpeakOptions): Promise<void> {
  const { text, messageId, rate, lang } = options;

  const listening = activeListening;
  if (listening) {
    try {
      await listening.suspend();
    } catch {
      // A microphone problem must never silence the user's voice: worst case
      // the recognizer transcribes our own TTS output for one utterance.
    }
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('tts-playback-state', {
        detail: { messageId, isPlaying: true },
      }),
    );
  }

  try {
    await TextToSpeech.speak({
      text,
      lang: lang ?? toBcp47(null),
      rate: rate ?? 1.0,
      queueStrategy: QueueStrategy.Flush,
    });
  } finally {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('tts-playback-state', {
          detail: { messageId, isPlaying: false },
        }),
      );
    }
    listening?.resume();
  }
}

/**
 * Stop any ongoing native TTS playback.
 */
export async function stopNativeSpeaking(): Promise<void> {
  try {
    await TextToSpeech.stop();
  } catch {
    // Not speaking: fine.
  }
}
