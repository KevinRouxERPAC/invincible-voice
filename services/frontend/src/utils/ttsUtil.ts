import { addAuthHeaders } from '../auth/authUtils';
import { apiUrl } from './backend';
import { speakNative, toBcp47 } from './nativeSpeech';
import { isNativeApp } from './platform';
import { getSpeechRate } from './speechRate';
import { ttsCache, CacheType } from './ttsCache';

/** App locale (saved by I18nProvider), used for the native TTS language. */
function getAppLocale(): string | null {
  if (typeof localStorage === 'undefined') {
    return null;
  }
  return localStorage.getItem('invincible-voice-locale');
}

export interface TTSOptions {
  text: string;
  cacheType?: CacheType;
  messageId: string;
  voiceName?: string;
  /**
   * Playback speed multiplier. When omitted, the user's persisted speech-rate
   * preference is used (1.0 = normal speed).
   */
  playbackRate?: number;
  /**
   * Speak with the phone's built-in TTS engine instead of streaming from the
   * backend. The native app sets this only when offline; online it uses the
   * backend (Gradium) cloned voice exactly like the web. Ignored on the web
   * (there is no native engine).
   */
  useNativeVoice?: boolean;
}

// One AudioContext for the whole session, kept alive by this module-level
// reference. Creating a fresh context per call (the previous behaviour) let the
// browser garbage-collect it while audio was still scheduled — on the Android
// WebView this cut playback off mid-sentence — and leaked contexts until the
// per-tab limit (~4-6) was hit, after which no further audio played at all.
let sharedAudioContext: AudioContext | null = null;

function getSharedAudioContext(sampleRate: number): AudioContext {
  if (
    !sharedAudioContext ||
    sharedAudioContext.state === 'closed' ||
    sharedAudioContext.sampleRate !== sampleRate
  ) {
    sharedAudioContext = new AudioContext({ sampleRate });
  }
  // Mobile WebViews hand back a suspended context; resume it or scheduled
  // sources stay silent. resume() is absent on some test mocks — guard it.
  if (
    sharedAudioContext.state === 'suspended' &&
    typeof sharedAudioContext.resume === 'function'
  ) {
    sharedAudioContext.resume().catch(() => {});
  }
  return sharedAudioContext;
}

/**
 * Plays TTS audio progressively using streaming
 * @param options - TTS options including text, cacheType
 */
export async function playTTSStream(
  options: TTSOptions,
): Promise<AudioContext | undefined> {
  const { text, messageId, cacheType = 'temporary', voiceName } = options;
  const playbackRate = options.playbackRate ?? getSpeechRate();

  // Native app, offline only: use the phone's TTS engine — free, no backend
  // call. Online the native app streams from the backend like the web, so the
  // user hears their cloned voice (a backend/Gradium feature). `useNativeVoice`
  // is driven by the same offline signal as the LLM fallback (preferLocal).
  if (isNativeApp() && options.useNativeVoice) {
    await speakNative({
      text,
      messageId,
      rate: playbackRate,
      lang: toBcp47(getAppLocale()),
    });
    return undefined;
  }

  /* Fetch sample rate from backend */
  const SAMPLE_RATE = await fetch(apiUrl('/v1/tts/sample_rate')).then((res) =>
    res.json().then((data) => data.sample_rate),
  );
  const audioContext = getSharedAudioContext(SAMPLE_RATE);

  // Use voiceName as part of cache key so different voices have separate entries
  const cacheKey = voiceName ? `${text}|${voiceName}` : text;
  if (ttsCache.get(cacheKey)) {
    const fullAudio = ttsCache.get(cacheKey)!;
    const audioBuffer = audioContext.createBuffer(
      1,
      fullAudio?.length,
      SAMPLE_RATE,
    );
    audioBuffer.copyToChannel(fullAudio, 0);
    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    if (source.playbackRate) {
      source.playbackRate.value = playbackRate;
    }
    source.connect(audioContext.destination);

    // Dispatch start event
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('tts-playback-state', {
          detail: { messageId, isPlaying: true },
        }),
      );
    }

    source.onended = () => {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('tts-playback-state', {
            detail: { messageId, isPlaying: false },
          }),
        );
      }
    };

    source.start();

    return audioContext;
  }

  let nextStartTime = 0;
  let isFirstChunk = true;
  let lastSourceNode: AudioBufferSourceNode | null = null;

  const requestBody: {
    text: string;
    message_id: string;
    voice_name?: string;
  } = { text, message_id: messageId };
  if (options.voiceName) {
    requestBody.voice_name = options.voiceName;
  }

  const response = await fetch(apiUrl(`/v1/tts/`), {
    method: 'POST',
    headers: addAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(requestBody),
  });

  if (!response.ok || !response.body) {
    throw new Error('TTS streaming failed');
  }

  const reader = response.body.getReader();
  const audioChunks: Float32Array[] = [];
  // A streamed chunk can end in the middle of a 16-bit PCM sample, so its raw
  // byte length is sometimes odd (the Android WebView splits chunks this way).
  // Carry that trailing byte over to the next chunk: feeding an odd-length
  // buffer to Int16Array throws "byte length ... should be a multiple of 2",
  // which aborted playback and left the "playing" indicator stuck on.
  let carry = new Uint8Array(0);
  const processChunks = async () => {
    while (true) {
      // eslint-disable-next-line no-await-in-loop
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      if (!value || value.byteLength === 0) {
        // eslint-disable-next-line no-continue
        continue;
      }

      // Prepend any byte left over from the previous chunk, then hold back a new
      // trailing odd byte (if any) for the next one.
      let bytes = value;
      if (carry.byteLength > 0) {
        bytes = new Uint8Array(carry.byteLength + value.byteLength);
        bytes.set(carry, 0);
        bytes.set(value, carry.byteLength);
      }
      const usableBytes = bytes.byteLength - (bytes.byteLength % 2);
      carry =
        usableBytes < bytes.byteLength
          ? bytes.slice(usableBytes)
          : new Uint8Array(0);
      if (usableBytes === 0) {
        // eslint-disable-next-line no-continue
        continue;
      }

      const numberOfFrames = usableBytes / 2;
      const audioBuffer = audioContext.createBuffer(
        1,
        numberOfFrames,
        SAMPLE_RATE,
      );
      // slice() yields a fresh, 2-byte-aligned buffer at offset 0, so the
      // Int16Array view is always valid (value.byteOffset itself may be odd,
      // and value.buffer could be larger than the chunk).
      const pcmInt16View = new Int16Array(bytes.slice(0, usableBytes).buffer);
      const pcmFloat32Data = new Float32Array(numberOfFrames);

      for (let i = 0; i < numberOfFrames; i += 1) {
        pcmFloat32Data[i] = pcmInt16View[i] / 32768.0;
      }

      audioBuffer.copyToChannel(pcmFloat32Data, 0);
      audioChunks.push(pcmFloat32Data);

      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      if (source.playbackRate) {
        source.playbackRate.value = playbackRate;
      }
      source.connect(audioContext.destination);
      lastSourceNode = source;

      if (isFirstChunk) {
        // Start immediately (with a tiny buffer to avoid underrun)
        nextStartTime = audioContext.currentTime + 0.01;
        isFirstChunk = false;

        // Dispatch start event
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('tts-playback-state', {
              detail: { messageId, isPlaying: true },
            }),
          );
        }
      }

      source.start(nextStartTime);
      // The chunk plays back in `duration / playbackRate` seconds, so the next
      // chunk must be scheduled accordingly to avoid gaps or overlaps.
      nextStartTime += audioBuffer.duration / playbackRate;
    }
  };

  await processChunks();

  // Setup completion trigger on the final scheduled audio chunk
  if (lastSourceNode) {
    (lastSourceNode as AudioBufferSourceNode).onended = () => {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('tts-playback-state', {
            detail: { messageId, isPlaying: false },
          }),
        );
      }
    };
  } else if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('tts-playback-state', {
        detail: { messageId, isPlaying: false },
      }),
    );
  }

  let fullMessageLength = 0;
  for (let i = 0; i < audioChunks.length; i += 1) {
    fullMessageLength += audioChunks[i].length;
  }
  let index = 0;
  const fullMessageBuffer = new Float32Array(fullMessageLength);
  for (let i = 0; i < audioChunks.length; i += 1) {
    for (let j = 0; j < audioChunks[i].length; j += 1) {
      fullMessageBuffer[index] = audioChunks[i][j];
      index += 1;
    }
  }
  ttsCache.set(cacheKey, fullMessageBuffer, cacheType);

  return audioContext;
}
