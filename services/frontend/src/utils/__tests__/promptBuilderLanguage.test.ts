import { buildSystemPrompt } from '../promptBuilder';
import type { UserData, UserSettings } from '../userData';

const baseSettings: UserSettings = {
  name: 'Alex',
  prompt: '',
  additional_keywords: [],
  friends: [],
  documents: [],
  quick_phrases: [],
  appointments: [],
  voice: null,
  expected_transcription_language: null,
  accepted_terms_of_services: true,
  learn_style: false,
};

const makeUserData = (
  language: string | null,
): UserData => ({
  email: '',
  user_id: 'local',
  user_settings: { ...baseSettings, expected_transcription_language: language },
  conversations: [
    {
      messages: [{ speaker: 'Friend', content: 'Guten Tag' }],
      start_time: '2025-01-01T00:00:00Z',
    },
  ],
});

describe('promptBuilder output-language lock', () => {
  it('adds no language lock when detection is on auto', () => {
    const prompt = buildSystemPrompt(makeUserData(null), { desiredLength: 'M' });
    expect(prompt).not.toContain("User's enforced language");
  });

  it('locks the output language when the user chose one', () => {
    // A mis-detected foreign word must not derail the suggestions into a
    // language the voiceless user cannot correct by speaking.
    const prompt = buildSystemPrompt(makeUserData('fr'), { desiredLength: 'M' });
    expect(prompt).toContain("User's enforced language");
    expect(prompt).toContain('French');
  });
});

describe('promptBuilder learn_style', () => {
  const withMemory = (learnStyle: boolean): UserData => ({
    ...makeUserData('fr'),
    user_settings: {
      ...baseSettings,
      expected_transcription_language: 'fr',
      learn_style: learnStyle,
    },
    memory: {
      facts: [],
      tone_profile: {
        summary: 'Short, warm, informal sentences.',
        updated_at: '2025-01-01T00:00:00Z',
      },
      style_exchanges: [
        { speaker_turn: 'How are you?', user_reply: 'Fine, thanks.' },
        { speaker_turn: 'Coffee?', user_reply: 'Yes please.' },
        { speaker_turn: 'Ready?', user_reply: 'Almost.' },
      ],
      processed_conversations: [],
      facts_processed_conversations: [],
      conversations_since_tone_refresh: 0,
    },
  });

  it('includes style portrait and exchanges when learn_style is on', () => {
    const prompt = buildSystemPrompt(withMemory(true), { desiredLength: 'M' });
    expect(prompt).toContain("## Portrait of the user's style");
    expect(prompt).toContain('Short, warm, informal sentences.');
    expect(prompt).toContain('## How the user likes to phrase things');
    expect(prompt).toContain('Fine, thanks.');
  });

  it('omits style sections when learn_style is off', () => {
    const prompt = buildSystemPrompt(withMemory(false), { desiredLength: 'M' });
    expect(prompt).not.toContain("## Portrait of the user's style");
    expect(prompt).not.toContain('## How the user likes to phrase things');
    expect(prompt).not.toContain('Short, warm, informal sentences.');
    expect(prompt).not.toContain('Fine, thanks.');
  });
});
