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

describe('offline edit queue (pending settings)', () => {
  const mockFetch = (
    impl: (url: string, init?: RequestInit) => Promise<unknown>,
  ) => {
    global.fetch = jest.fn(impl as unknown as typeof fetch);
  };

  const {
    queuePendingSettings,
    loadPendingSettings,
    clearPendingSettings,
  } = require('../localUserData');

  const SETTINGS = {
    name: 'Kevin',
    prompt: '',
    additional_keywords: [],
    friends: [],
    documents: [],
    quick_phrases: [{ id: 'q1', text: 'Test hors-ligne QA.' }],
    appointments: [],
    voice: null,
    expected_transcription_language: null,
    accepted_terms_of_services: true,
    learn_style: true,
  } as unknown as UserSettings;

  const SERVER_USER = {
    email: 'kevin@example.com',
    user_id: 'server-123',
    user_settings: { name: 'Kevin', quick_phrases: [] },
    conversations: [],
    memory: emptyUserMemory(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
    isNativeApp.mockReturnValue(true);
  });

  it('queues the edit when the cloud POST fails offline', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new TypeError('Failed to fetch'));

    await updateUserSettings(SETTINGS);

    const pending = loadPendingSettings();
    expect(pending).not.toBeNull();
    expect(pending.settings.quick_phrases).toEqual([
      { id: 'q1', text: 'Test hors-ligne QA.' },
    ]);
  });

  it('does not queue when the cloud POST succeeds', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 });

    await updateUserSettings(SETTINGS);

    expect(loadPendingSettings()).toBeNull();
  });

  it('re-POSTs the pending edit and clears the queue on a later successful fetch', async () => {
    // 1) Offline edit → queued
    global.fetch = jest
      .fn()
      .mockRejectedValue(new TypeError('Failed to fetch'));
    await updateUserSettings(SETTINGS);
    expect(loadPendingSettings()).not.toBeNull();

    // 2) Backend reachable again: getUserData answers the STALE server
    //    profile (without the offline phrase), flush re-POSTs the edit.
    const postCalls: { url: string; body: string }[] = [];
    mockFetch((url, init) => {
      if (init?.method === 'POST') {
        postCalls.push({ url, body: String(init.body) });
        return Promise.resolve({ ok: true, status: 200 });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(SERVER_USER),
      });
    });

    const result = await getUserData();

    expect(postCalls).toHaveLength(1);
    expect(JSON.parse(postCalls[0].body).quick_phrases).toEqual([
      { id: 'q1', text: 'Test hors-ligne QA.' },
    ]);
    expect(loadPendingSettings()).toBeNull();
    // The caller receives the server profile (stale in this mock, but the
    // real backend now holds the synced edit).
    expect(result.data?.user_id).toBe('server-123');
  });

  it('keeps the pending edit and merges it when the flush still fails', async () => {
    queuePendingSettings(SETTINGS);

    // Backend reachable for GET but the flush POST still fails.
    mockFetch((url, init) => {
      if (init?.method === 'POST') {
        return Promise.reject(new TypeError('Failed to fetch'));
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(SERVER_USER),
      });
    });

    const result = await getUserData();

    // The user-facing profile and the local mirror keep the offline edit.
    expect(
      result.data?.user_settings.quick_phrases?.some(
        (p) => p.text === 'Test hors-ligne QA.',
      ),
    ).toBe(true);
    expect(
      loadLocalUserData()?.user_settings.quick_phrases?.some(
        (p) => p.text === 'Test hors-ligne QA.',
      ),
    ).toBe(true);
    // Still queued for the next opportunity.
    expect(loadPendingSettings()).not.toBeNull();
  });

  it('drops the queue on an auth error instead of looping', async () => {
    queuePendingSettings(SETTINGS);

    mockFetch((url, init) => {
      if (init?.method === 'POST') {
        return Promise.resolve({ ok: false, status: 401 });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(SERVER_USER),
      });
    });

    const result = await getUserData();

    expect(loadPendingSettings()).toBeNull();
    expect(result.data?.user_id).toBe('server-123');
  });

  it('never queues or flushes on the web build', async () => {
    isNativeApp.mockReturnValue(false);

    global.fetch = jest
      .fn()
      .mockRejectedValue(new TypeError('Failed to fetch'));
    await updateUserSettings(SETTINGS);

    expect(loadPendingSettings()).toBeNull();

    clearPendingSettings();
  });
});
