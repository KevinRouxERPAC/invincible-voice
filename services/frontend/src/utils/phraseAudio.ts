// Persistent audio for quick phrases.
//
// Quick phrases are spoken instantly, without going through the LLM. Their
// TTS audio (the user's cloned voice) is stored in IndexedDB so playback
// works with zero latency and even when the backend is unreachable. When no
// audio is cached and the network is down, we fall back to the browser's
// built-in speech synthesis: a worse voice, but the user is never mute.
import { addAuthHeaders } from '../auth/authUtils';
import { apiUrl } from './backend';
import { QuickPhrase } from './userData';

const DB_NAME = 'invincible-voice';
const DB_VERSION = 1;
const STORE_NAME = 'phrase-audio';

export interface StoredPhraseAudio {
  sampleRate: number;
  pcm: Float32Array;
}

/**
 * Cache key for a phrase, consistent with ttsUtil's memory cache keys.
 */
export function phraseCacheKey(
  text: string,
  voiceName?: string | null,
): string {
  return voiceName ? `${text}|${voiceName}` : text;
}

/**
 * Group phrases by category, preserving insertion order. Phrases without a
 * category end up under the '' key.
 */
export function groupPhrasesByCategory(
  phrases: QuickPhrase[],
): Map<string, QuickPhrase[]> {
  const groups = new Map<string, QuickPhrase[]>();
  phrases.forEach((phrase) => {
    const category = phrase.category.trim();
    const group = groups.get(category);
    if (group) {
      group.push(phrase);
    } else {
      groups.set(category, [phrase]);
    }
  });
  return groups;
}

function openDb(): Promise<IDBDatabase | null> {
  // SSR and test environments have no IndexedDB; degrade to no persistence
  if (typeof indexedDB === 'undefined') {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

export async function getStoredPhraseAudio(
  key: string,
): Promise<StoredPhraseAudio | null> {
  const db = await openDb();
  if (!db) {
    return null;
  }

  return new Promise((resolve) => {
    try {
      const request = db
        .transaction(STORE_NAME, 'readonly')
        .objectStore(STORE_NAME)
        .get(key);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function storePhraseAudio(
  key: string,
  audio: StoredPhraseAudio,
): Promise<void> {
  const db = await openDb();
  if (!db) {
    return;
  }

  await new Promise<void>((resolve) => {
    try {
      const request = db
        .transaction(STORE_NAME, 'readwrite')
        .objectStore(STORE_NAME)
        .put(audio, key);
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

/**
 * Fetch the full TTS audio for a phrase from the backend (without playing
 * it) and persist it to IndexedDB.
 */
export async function fetchAndStorePhraseAudio(
  text: string,
  voiceName?: string | null,
): Promise<StoredPhraseAudio> {
  const sampleRate: number = await fetch(apiUrl('/v1/tts/sample_rate')).then(
    (res) => res.json().then((data) => data.sample_rate),
  );

  const requestBody: { text: string; message_id: string; voice_name?: string } =
    {
      text,
      message_id: crypto.randomUUID(),
    };
  if (voiceName) {
    requestBody.voice_name = voiceName;
  }

  const response = await fetch(apiUrl(`/v1/tts/`), {
    method: 'POST',
    headers: addAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    throw new Error('TTS fetch failed');
  }

  const pcmInt16 = new Int16Array(await response.arrayBuffer());
  const pcm = new Float32Array(pcmInt16.length);
  for (let i = 0; i < pcmInt16.length; i += 1) {
    pcm[i] = pcmInt16[i] / 32768.0;
  }

  const audio: StoredPhraseAudio = { sampleRate, pcm };
  await storePhraseAudio(phraseCacheKey(text, voiceName), audio);
  return audio;
}

function playPcm(audio: StoredPhraseAudio): void {
  const audioContext = new AudioContext({ sampleRate: audio.sampleRate });
  const buffer = audioContext.createBuffer(
    1,
    audio.pcm.length,
    audio.sampleRate,
  );
  buffer.copyToChannel(audio.pcm as Float32Array<ArrayBuffer>, 0);
  const source = audioContext.createBufferSource();
  source.buffer = buffer;
  source.connect(audioContext.destination);
  source.onended = () => {
    audioContext.close().catch(() => {});
  };
  source.start();
}

/**
 * Last-resort, fully offline speech via the browser's built-in synthesis.
 */
export function speakWithBrowserSynthesis(text: string, lang?: string): void {
  if (typeof speechSynthesis === 'undefined') {
    return;
  }
  const utterance = new SpeechSynthesisUtterance(text);
  if (lang) {
    utterance.lang = lang;
  }
  speechSynthesis.cancel();
  speechSynthesis.speak(utterance);
}

export interface PlayQuickPhraseOptions {
  text: string;
  voiceName?: string | null;
  /** BCP-47 hint for the browser-synthesis fallback, e.g. 'fr' */
  lang?: string;
}

export type QuickPhrasePlayback = 'cached' | 'network' | 'browser-synthesis';

/**
 * Speak a quick phrase as fast as possible: persisted audio first, then the
 * backend TTS (caching the result), then browser speech synthesis when
 * everything else is unreachable. Resolves with the path that was used.
 */
export async function playQuickPhrase(
  options: PlayQuickPhraseOptions,
): Promise<QuickPhrasePlayback> {
  const { text, voiceName, lang } = options;

  const stored = await getStoredPhraseAudio(phraseCacheKey(text, voiceName));
  if (stored) {
    playPcm(stored);
    return 'cached';
  }

  try {
    const audio = await fetchAndStorePhraseAudio(text, voiceName);
    playPcm(audio);
    return 'network';
  } catch {
    speakWithBrowserSynthesis(text, lang);
    return 'browser-synthesis';
  }
}

/**
 * Make sure every quick phrase has persisted audio for the given voice.
 * Fetches sequentially to stay gentle with the TTS API; already-cached
 * phrases are skipped, so this is a no-op after the first run.
 */
export async function prefetchQuickPhrases(
  phrases: QuickPhrase[],
  voiceName?: string | null,
): Promise<void> {
  // eslint-disable-next-line no-restricted-syntax
  for (const phrase of phrases) {
    const key = phraseCacheKey(phrase.text, voiceName);
    // eslint-disable-next-line no-await-in-loop
    const stored = await getStoredPhraseAudio(key);
    if (!stored) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await fetchAndStorePhraseAudio(phrase.text, voiceName);
      } catch {
        // Offline or TTS unavailable: stop trying, we'll retry next launch
        return;
      }
    }
  }
}
