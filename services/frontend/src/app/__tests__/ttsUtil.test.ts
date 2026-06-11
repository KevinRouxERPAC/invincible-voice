import { ttsCache } from '../../utils/ttsCache';
import { playTTSStream } from '../../utils/ttsUtil';

const SAMPLE_RATE = 24000;

// Build a fake streaming response body with one PCM16 chunk
const makeStreamBody = (frames: number) => {
  const chunk = new Uint8Array(frames * 2); // 2 bytes per PCM16 frame
  const read = jest
    .fn()
    .mockResolvedValueOnce({ value: chunk, done: false })
    .mockResolvedValue({ value: undefined, done: true });
  return { getReader: () => ({ read }) };
};

const mockFetchForTTS = (
  options: { ttsOk?: boolean; frames?: number } = {},
) => {
  const { ttsOk = true, frames = 4 } = options;
  return jest.fn().mockImplementation((url: string) => {
    if (url.includes('/v1/tts/sample_rate')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ sample_rate: SAMPLE_RATE }),
      });
    }
    if (url.includes('/v1/tts/')) {
      return Promise.resolve({
        ok: ttsOk,
        body: ttsOk ? makeStreamBody(frames) : null,
      });
    }
    return Promise.reject(new Error('Unknown URL'));
  });
};

describe('TTS Utility', () => {
  beforeEach(() => {
    ttsCache.clear();
    jest.clearAllMocks();

    // Minimal Web Audio mock supporting the streaming playback path
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

  afterEach(() => {
    ttsCache.clear();
  });

  describe('playTTSStream', () => {
    test('fetches the sample rate and streams TTS audio from the backend', async () => {
      global.fetch = mockFetchForTTS();

      await playTTSStream({
        text: 'Hello world',
        messageId: 'msg-1',
        cacheType: 'temporary',
      });

      expect(global.fetch).toHaveBeenCalledWith('/api/v1/tts/sample_rate');
      expect(global.fetch).toHaveBeenCalledWith('/api/v1/tts/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'Hello world', message_id: 'msg-1' }),
      });
    });

    test('includes voice_name in the request when provided', async () => {
      global.fetch = mockFetchForTTS();

      await playTTSStream({
        text: 'Hello world',
        messageId: 'msg-1',
        voiceName: 'my-voice',
      });

      expect(global.fetch).toHaveBeenCalledWith('/api/v1/tts/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: 'Hello world',
          message_id: 'msg-1',
          voice_name: 'my-voice',
        }),
      });
    });

    test('caches the streamed audio after playback', async () => {
      global.fetch = mockFetchForTTS({ frames: 4 });

      await playTTSStream({
        text: 'Hello world',
        messageId: 'msg-1',
        cacheType: 'permanent',
      });

      expect(ttsCache.has('Hello world')).toBe(true);
      expect(ttsCache.get('Hello world')).toHaveLength(4);
    });

    test('plays from cache without requesting TTS again', async () => {
      global.fetch = mockFetchForTTS();
      ttsCache.set('Hello world', new Float32Array(4), 'temporary');

      await playTTSStream({
        text: 'Hello world',
        messageId: 'msg-1',
        cacheType: 'temporary',
      });

      // Only the sample-rate endpoint is hit, not the TTS endpoint
      expect(global.fetch).toHaveBeenCalledWith('/api/v1/tts/sample_rate');
      expect(global.fetch).not.toHaveBeenCalledWith(
        '/api/v1/tts/',
        expect.anything(),
      );
    });

    test('uses a voice-specific cache key when voiceName is provided', async () => {
      global.fetch = mockFetchForTTS({ frames: 4 });

      await playTTSStream({
        text: 'Hello world',
        messageId: 'msg-1',
        cacheType: 'permanent',
        voiceName: 'my-voice',
      });

      expect(ttsCache.has('Hello world|my-voice')).toBe(true);
      expect(ttsCache.has('Hello world')).toBe(false);
    });

    test('throws when the TTS request fails', async () => {
      global.fetch = mockFetchForTTS({ ttsOk: false });

      await expect(
        playTTSStream({ text: 'Hello world', messageId: 'msg-1' }),
      ).rejects.toThrow('TTS streaming failed');
    });
  });
});
