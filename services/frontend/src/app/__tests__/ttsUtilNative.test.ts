/**
 * TTS routing on the native (Capacitor) app.
 *
 * The native app now mirrors the LLM hybrid switch for voice too: when online
 * it streams from the backend (Gradium cloned voice) exactly like the web, and
 * only falls back to the phone's own TTS engine when offline. `playTTSStream`
 * carries that decision through the `useNativeVoice` flag.
 */
import { ttsCache } from '../../utils/ttsCache';

jest.mock('@/utils/platform', () => ({
  isNativeApp: jest.fn(() => true),
}));

jest.mock('@/utils/nativeSpeech', () => ({
  speakNative: jest.fn(() => Promise.resolve()),
  toBcp47: jest.fn(() => 'fr-FR'),
}));

const SAMPLE_RATE = 24000;

const makeStreamBody = (frames: number) => {
  const chunk = new Uint8Array(frames * 2);
  const read = jest
    .fn()
    .mockResolvedValueOnce({ value: chunk, done: false })
    .mockResolvedValue({ value: undefined, done: true });
  return { getReader: () => ({ read }) };
};

const mockFetchForTTS = () =>
  jest.fn().mockImplementation((url: string) => {
    if (url.includes('/v1/tts/sample_rate')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ sample_rate: SAMPLE_RATE }),
      });
    }
    if (url.includes('/v1/tts/')) {
      return Promise.resolve({ ok: true, body: makeStreamBody(4) });
    }
    return Promise.reject(new Error('Unknown URL'));
  });

describe('playTTSStream on the native app', () => {
  beforeEach(() => {
    ttsCache.clear();
    jest.clearAllMocks();
    global.AudioContext = jest.fn().mockImplementation(() => ({
      createBuffer: jest.fn(() => ({
        copyToChannel: jest.fn(),
        duration: 0.1,
      })),
      createBufferSource: jest.fn(() => ({
        connect: jest.fn(),
        start: jest.fn(),
        buffer: null,
        playbackRate: { value: 1 },
      })),
      destination: {},
      currentTime: 0,
    })) as unknown as typeof AudioContext;
  });

  afterEach(() => ttsCache.clear());

  test('offline (useNativeVoice): speaks with the phone engine, no backend call', async () => {
    const { speakNative } = require('@/utils/nativeSpeech');
    global.fetch = mockFetchForTTS();

    const result = await playTTSStreamFresh({
      text: 'Bonjour',
      messageId: 'm1',
      useNativeVoice: true,
    });

    expect(speakNative).toHaveBeenCalledTimes(1);
    expect(speakNative).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'Bonjour', messageId: 'm1' }),
    );
    expect(global.fetch).not.toHaveBeenCalled();
    expect(result).toBeUndefined();
  });

  test('online (no useNativeVoice): streams from the backend cloned voice', async () => {
    const { speakNative } = require('@/utils/nativeSpeech');
    global.fetch = mockFetchForTTS();

    await playTTSStreamFresh({
      text: 'Bonjour',
      messageId: 'm2',
      voiceName: 'ma-voix',
    });

    expect(speakNative).not.toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalledWith('/api/v1/tts/sample_rate');
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/v1/tts/',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});

// Import lazily so the module picks up the mocked platform/nativeSpeech.
async function playTTSStreamFresh(
  options: Parameters<
    typeof import('../../utils/ttsUtil').playTTSStream
  >[0],
) {
  const { playTTSStream } = await import('../../utils/ttsUtil');
  return playTTSStream(options);
}
