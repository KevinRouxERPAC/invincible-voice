/**
 * Regression test for the TTS audio cutoff bug: playTTSStream must reuse a
 * single AudioContext across calls instead of creating one per call. A fresh
 * context per call let the Android WebView garbage-collect it mid-playback
 * (cutting the first sentence) and leaked contexts until the per-tab limit was
 * reached (silencing every later sentence).
 */
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

describe('playTTSStream AudioContext reuse', () => {
  test('constructs a single AudioContext for repeated calls', async () => {
    const audioContextCtor = jest.fn().mockImplementation(() => ({
      // A realistic context: known sampleRate + resumable suspended state so
      // the shared-context guard recognises it as reusable.
      sampleRate: SAMPLE_RATE,
      state: 'running',
      resume: jest.fn().mockResolvedValue(undefined),
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
    }));

    await jest.isolateModulesAsync(async () => {
      global.AudioContext = audioContextCtor as unknown as typeof AudioContext;
      global.fetch = mockFetchForTTS();
      const { playTTSStream } = await import('../../utils/ttsUtil');

      await playTTSStream({ text: 'first sentence', messageId: 'm1' });
      await playTTSStream({ text: 'second sentence', messageId: 'm2' });
      await playTTSStream({ text: 'third sentence', messageId: 'm3' });
    });

    expect(audioContextCtor).toHaveBeenCalledTimes(1);
  });
});
