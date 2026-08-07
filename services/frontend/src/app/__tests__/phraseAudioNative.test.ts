/**
 * Native-app behaviour of playQuickPhrase: offline uses the phone's TTS engine,
 * online uses the backend's cloned Gradium voice (with a native fallback).
 * Kept in its own file so isNativeApp can be mocked to `true` for the whole
 * suite without affecting the web-path tests in phraseAudio.test.ts.
 */
jest.mock('../../utils/platform', () => ({
  isNativeApp: jest.fn(() => true),
  getNativePlatform: jest.fn(() => 'android'),
}));

jest.mock('../../utils/nativeSpeech', () => ({
  speakNative: jest.fn(() => Promise.resolve()),
  toBcp47: (l: string | null) => l ?? 'fr-FR',
}));

// eslint-disable-next-line import/first
import { playQuickPhrase } from '../../utils/phraseAudio';
// eslint-disable-next-line import/first
import { speakNative } from '../../utils/nativeSpeech';

const SAMPLE_RATE = 48000;

const mockFetchForTTS = () =>
  jest.fn().mockImplementation((url: string) => {
    if (url.includes('/v1/tts/sample_rate')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ sample_rate: SAMPLE_RATE }),
      });
    }
    if (url.includes('/v1/tts/')) {
      return Promise.resolve({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
      });
    }
    return Promise.reject(new Error('Unknown URL'));
  });

const mockAudioContext = () => {
  const start = jest.fn();
  global.AudioContext = jest.fn().mockImplementation(() => ({
    createBuffer: jest.fn(() => ({ copyToChannel: jest.fn() })),
    createBufferSource: jest.fn(() => ({ connect: jest.fn(), start, buffer: null })),
    destination: {},
    close: jest.fn(() => Promise.resolve()),
  })) as unknown as typeof AudioContext;
  return start;
};

describe('playQuickPhrase (native app)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('offline (preferLocal) speaks with the phone engine, no backend call', async () => {
    global.fetch = jest.fn();

    const playback = await playQuickPhrase({
      text: 'Bonjour',
      preferLocal: true,
    });

    expect(playback).toBe('native');
    expect(speakNative).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'Bonjour' }),
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('online uses the backend Gradium voice', async () => {
    global.fetch = mockFetchForTTS();
    const start = mockAudioContext();

    const playback = await playQuickPhrase({
      text: 'Bonjour',
      voiceName: 'ma-voix',
      preferLocal: false,
    });

    expect(playback).toBe('network');
    expect(start).toHaveBeenCalled();
    expect(speakNative).not.toHaveBeenCalled();
  });

  test('online falls back to the phone engine when the backend is unreachable', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('offline'));

    const playback = await playQuickPhrase({
      text: 'Bonjour',
      preferLocal: false,
    });

    expect(playback).toBe('native');
    expect(speakNative).toHaveBeenCalled();
  });
});
