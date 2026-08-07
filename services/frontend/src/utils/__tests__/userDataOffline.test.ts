import { getUserData, updateUserSettings } from '../userData';
import { loadLocalUserData, saveLocalUserData } from '../localUserData';
import { emptyUserMemory } from '../memory';
import type { UserSettings } from '../userData';

jest.mock('@/utils/platform', () => ({
  isNativeApp: jest.fn(() => true),
}));

jest.mock('../backend', () => ({
  apiUrl: (path: string) => `http://backend${path}`,
}));

const { isNativeApp } = jest.requireMock('@/utils/platform');

const SERVER_USER = {
  email: 'kevin@example.com',
  user_id: 'server-123',
  user_settings: { name: 'Kevin' },
  conversations: [],
  memory: emptyUserMemory(),
};

beforeEach(() => {
  jest.clearAllMocks();
  window.localStorage.clear();
  isNativeApp.mockReturnValue(true);
});

describe('getUserData', () => {
  it('returns the backend profile when the backend answers', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(SERVER_USER),
    });

    const result = await getUserData();

    expect(result.data).toEqual(SERVER_USER);
    expect(global.fetch).toHaveBeenCalled();
  });

  it('falls back to a local profile when the backend is unreachable', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('offline'));

    const result = await getUserData();

    expect(result.status).toBe(200);
    expect(result.data?.user_id).toBe('local');
    expect(result.error).toBeUndefined();
  });

  it('keeps the cached quick phrases in the offline profile', async () => {
    window.localStorage.setItem(
      'invincible-voice-settings-snapshot',
      JSON.stringify({
        quick_phrases: [{ id: '1', text: 'Bonjour' }],
        voice: 'fr-FR',
        expected_transcription_language: 'fr',
      }),
    );
    global.fetch = jest.fn().mockRejectedValue(new Error('offline'));

    const result = await getUserData();

    expect(result.data?.user_settings.quick_phrases).toEqual([
      { id: '1', text: 'Bonjour' },
    ]);
    expect(result.data?.user_settings.voice).toBe('fr-FR');
  });

  it('surfaces the error on the web build, which has no fallback', async () => {
    isNativeApp.mockReturnValue(false);
    global.fetch = jest.fn().mockRejectedValue(new Error('offline'));

    const result = await getUserData();

    expect(result.status).toBe(0);
    expect(result.error).toContain('Network error');
  });

  it('mirrors the fetched profile locally so it survives offline', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(SERVER_USER),
    });
    await getUserData();

    expect(loadLocalUserData()).toEqual(SERVER_USER);
  });

  it('returns the full stored profile (persona + history) when offline', async () => {
    const stored = {
      email: 'kevin@example.com',
      user_id: 'server-123',
      user_settings: { name: 'Kevin', learn_style: true },
      conversations: [
        {
          messages: [{ content: 'Bonjour à tous.', messageId: 'w1' }],
          start_time: '2026-07-10T10:00:00.000Z',
        },
      ],
    } as unknown as import('../userData').UserData;
    saveLocalUserData(stored);
    global.fetch = jest.fn().mockRejectedValue(new Error('offline'));

    const result = await getUserData();

    expect(result.data?.user_settings.name).toBe('Kevin');
    expect(result.data?.conversations).toHaveLength(1);
    expect(result.data?.conversations[0].messages[0]).toMatchObject({
      content: 'Bonjour à tous.',
    });
  });
});

describe('updateUserSettings (local mirror)', () => {
  const SETTINGS = {
    name: 'Kevin',
    prompt: '',
    additional_keywords: [],
    friends: [],
    documents: [],
    quick_phrases: [],
    appointments: [],
    voice: null,
    expected_transcription_language: null,
    accepted_terms_of_services: true,
    learn_style: true,
  } as unknown as UserSettings;

  it('persists the persona locally on native, and still POSTs when online', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 });

    const result = await updateUserSettings(SETTINGS);

    expect(result.status).toBe(200);
    expect(global.fetch).toHaveBeenCalled();
    expect(loadLocalUserData()?.user_settings.name).toBe('Kevin');
  });

  it('keeps the local mirror as success when the cloud POST fails offline', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new TypeError('Failed to fetch'));

    const result = await updateUserSettings(SETTINGS);

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(loadLocalUserData()?.user_settings.name).toBe('Kevin');
  });
});
