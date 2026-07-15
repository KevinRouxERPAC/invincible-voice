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

  // Native app: use the phone's TTS engine — free, offline, no backend call.
  // The cloned-voice option (voiceName) is a backend/Gradium feature and is
  // intentionally ignored here.
  if (isNativeApp()) {
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
  const processChunks = async () => {
    while (true) {
      // eslint-disable-next-line no-await-in-loop
      const { value, done } = await reader.read();
      if (done) {
        break;
      }

      const pcmArrayBuffer = value.buffer;
      const numberOfFrames = pcmArrayBuffer.byteLength / 2;
      const audioBuffer = audioContext.createBuffer(
        1,
        numberOfFrames,
        SAMPLE_RATE,
      );
      const pcmInt16View = new Int16Array(pcmArrayBuffer);
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
