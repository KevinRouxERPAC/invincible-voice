import {
  appendLocalConversation,
  loadLocalUserData,
  saveLocalUserData,
  saveLocalUserSettings,
} from '../localUserData';
import type { Conversation, UserData, UserSettings } from '../userData';

const SETTINGS: UserSettings = {
  name: 'Kevin',
  prompt: 'Réponds en français, ton chaleureux.',
  additional_keywords: ['kiné', 'fauteuil'],
  friends: ['Marie', 'Paul'],
  documents: [{ title: 'Bio', content: 'Ancien ingénieur.' }],
  quick_phrases: [{ text: "J'ai soif.", category: 'Besoins' }],
  appointments: [],
  voice: 'my-voice',
  expected_transcription_language: 'fr',
  accepted_terms_of_services: true,
  learn_style: true,
};

const USER_DATA: UserData = {
  email: 'kevin@example.com',
  user_id: 'server-123',
  user_settings: SETTINGS,
  conversations: [
    {
      messages: [
        { speaker: 'Marie', content: 'Ça va ?' },
        { content: 'Oui, tranquille.', messageId: 'm1' },
      ],
      start_time: '2026-07-10T10:00:00.000Z',
    },
  ],
};

function conversation(marker: string): Conversation {
  return {
    messages: [{ content: marker, messageId: `id-${marker}` }],
    start_time: '2026-07-11T10:00:00.000Z',
  };
}

beforeEach(() => {
  localStorage.clear();
});

describe('localUserData storage', () => {
  test('returns null when nothing is stored', () => {
    expect(loadLocalUserData()).toBeNull();
  });

  test('round-trips the full profile (persona + history)', () => {
    saveLocalUserData(USER_DATA);
    expect(loadLocalUserData()).toEqual(USER_DATA);
  });

  test('survives corrupted storage content', () => {
    localStorage.setItem('invincible-voice-local-userdata', '{not json');
    expect(loadLocalUserData()).toBeNull();
  });

  test('ignores a blob without user_settings (legacy/partial write)', () => {
    localStorage.setItem(
      'invincible-voice-local-userdata',
      JSON.stringify({ email: 'x', conversations: [] }),
    );
    expect(loadLocalUserData()).toBeNull();
  });

  test('caps stored history to the most recent conversations', () => {
    const many = Array.from({ length: 40 }, (_, i) => conversation(`C${i}`));
    saveLocalUserData({ ...USER_DATA, conversations: many });

    const stored = loadLocalUserData();
    expect(stored?.conversations).toHaveLength(30);
    // The oldest ones are dropped, the newest kept.
    expect(stored?.conversations[0].messages[0].content).toBe('C10');
    expect(stored?.conversations[29].messages[0].content).toBe('C39');
  });
});

describe('saveLocalUserSettings', () => {
  test('creates a profile from scratch when none exists', () => {
    saveLocalUserSettings(SETTINGS);
    const stored = loadLocalUserData();
    expect(stored?.user_settings).toEqual(SETTINGS);
    expect(stored?.conversations).toEqual([]);
  });

  test('updates settings without dropping the stored history', () => {
    saveLocalUserData(USER_DATA);
    const newSettings: UserSettings = { ...SETTINGS, name: 'Kev' };
    saveLocalUserSettings(newSettings);

    const stored = loadLocalUserData();
    expect(stored?.user_settings.name).toBe('Kev');
    // History is preserved across a persona edit.
    expect(stored?.conversations).toEqual(USER_DATA.conversations);
  });
});

describe('appendLocalConversation', () => {
  test('appends a finished conversation to the stored history', () => {
    saveLocalUserData(USER_DATA);
    appendLocalConversation(conversation('NEW'));

    const stored = loadLocalUserData();
    expect(stored?.conversations).toHaveLength(2);
    expect(stored?.conversations[1].messages[0].content).toBe('NEW');
  });

  test('ignores an empty conversation (a session with no exchange)', () => {
    saveLocalUserData(USER_DATA);
    appendLocalConversation({ messages: [], start_time: '2026-07-11T00:00:00Z' });
    expect(loadLocalUserData()?.conversations).toHaveLength(1);
  });

  test('seeds a profile when appending before any settings were stored', () => {
    appendLocalConversation(conversation('FIRST'));
    const stored = loadLocalUserData();
    expect(stored?.user_id).toBe('local');
    expect(stored?.conversations).toHaveLength(1);
  });
});
