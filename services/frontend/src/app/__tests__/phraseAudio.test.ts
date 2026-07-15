import {
  fetchAndStorePhraseAudio,
  groupPhrasesByCategory,
  phraseCacheKey,
  playQuickPhrase,
} from '../../utils/phraseAudio';
import { QuickPhrase } from '../../utils/userData';

const SAMPLE_RATE = 48000;

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
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(frames * 2)),
      });
    }
    return Promise.reject(new Error('Unknown URL'));
  });
};

const mockAudioContext = () => {
  const start = jest.fn();
  global.AudioContext = jest.fn().mockImplementation(() => ({
    createBuffer: jest.fn(() => ({ copyToChannel: jest.fn() })),
    createBufferSource: jest.fn(() => ({
      connect: jest.fn(),
      start,
      buffer: null,
    })),
    destination: {},
    close: jest.fn(() => Promise.resolve()),
  })) as unknown as typeof AudioContext;
  return start;
};

describe('phraseCacheKey', () => {
  test('uses the bare text without a voice', () => {
    expect(phraseCacheKey('Bonjour')).toBe('Bonjour');
  });

  test('appends the voice name when provided', () => {
    expect(phraseCacheKey('Bonjour', 'ma-voix')).toBe('Bonjour|ma-voix');
  });
});

describe('groupPhrasesByCategory', () => {
  test('groups phrases preserving insertion order', () => {
    const phrases: QuickPhrase[] = [
      { text: "J'ai soif.", category: 'Besoins' },
      { text: 'Merci !', category: 'Social' },
      { text: "J'ai faim.", category: 'Besoins' },
    ];

    const groups = groupPhrasesByCategory(phrases);

    expect(Array.from(groups.keys())).toEqual(['Besoins', 'Social']);
    expect(groups.get('Besoins')!.map((p) => p.text)).toEqual([
      "J'ai soif.",
      "J'ai faim.",
    ]);
  });

  test('puts uncategorized phrases under the empty key', () => {
    const groups = groupPhrasesByCategory([
      { text: 'Bonjour', category: '  ' },
    ]);
    expect(groups.get('')).toHaveLength(1);
  });
});

describe('fetchAndStorePhraseAudio', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('fetches PCM audio and converts it to Float32', async () => {
    global.fetch = mockFetchForTTS({ frames: 8 });

    const audio = await fetchAndStorePhraseAudio('Bonjour', 'ma-voix');

    expect(audio.sampleRate).toBe(SAMPLE_RATE);
    expect(audio.pcm).toHaveLength(8);
    expect(global.fetch).toHaveBeenCalledWith('/api/v1/tts/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: expect.stringContaining('"voice_name":"ma-voix"'),
    });
  });

  test('throws when the TTS request fails', async () => {
    global.fetch = mockFetchForTTS({ ttsOk: false });

    await expect(fetchAndStorePhraseAudio('Bonjour')).rejects.toThrow(
      'TTS fetch failed',
    );
  });
});

describe('playQuickPhrase', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('plays via the network when nothing is cached', async () => {
    global.fetch = mockFetchForTTS();
    const start = mockAudioContext();

    const playback = await playQuickPhrase({ text: 'Bonjour' });

    expect(playback).toBe('network');
    expect(start).toHaveBeenCalled();
  });

  test('falls back to browser speech synthesis when the backend is unreachable', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('offline'));
    const speak = jest.fn();
    const cancel = jest.fn();
    (global as Record<string, unknown>).speechSynthesis = { speak, cancel };
    (global as Record<string, unknown>).SpeechSynthesisUtterance = jest
      .fn()
      .mockImplementation((text: string) => ({ text }));

    const playback = await playQuickPhrase({ text: 'Bonjour', lang: 'fr' });

    expect(playback).toBe('browser-synthesis');
    expect(speak).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'Bonjour', lang: 'fr' }),
    );
  });
});
