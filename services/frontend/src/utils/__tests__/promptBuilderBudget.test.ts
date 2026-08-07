import {
  buildSystemPrompt,
  MAX_CHARS_PER_MESSAGE,
  PROMPT_CHAR_BUDGET,
} from '../promptBuilder';
import type { Conversation, UserData, UserSettings } from '../userData';

const settings: UserSettings = {
  name: 'Alex',
  prompt: '',
  additional_keywords: [],
  friends: [],
  documents: [],
  quick_phrases: [],
  appointments: [],
  voice: null,
  expected_transcription_language: 'fr',
  accepted_terms_of_services: true,
  learn_style: false,
};

const longLine = (marker: string) =>
  `${marker} ${'blabla ambiant très long '.repeat(40)}`;

const conversation = (marker: string, messages: number): Conversation => ({
  messages: Array.from({ length: messages }, (_, i) => ({
    speaker: 'Friend',
    content: longLine(`${marker}-${i}`),
  })),
  start_time: '2025-01-01T00:00:00Z',
});

const userData = (conversations: Conversation[]): UserData => ({
  email: '',
  user_id: 'local',
  user_settings: settings,
  conversations,
});

describe('promptBuilder on-device budget', () => {
  // The native context is 2048 tokens: an oversized prompt used to make
  // llama_decode abort the whole app process. Every replayed line is clipped
  // and past conversations are dropped (oldest first) to stay under budget.

  it('clips a runaway ambient-STT line to MAX_CHARS_PER_MESSAGE', () => {
    const prompt = buildSystemPrompt(userData([conversation('now', 1)]), {
      desiredLength: 'M',
    });
    expect(prompt).not.toContain(longLine('now-0').trim());
    // Clipped line ends with an ellipsis and stays under the cap (+ prefix).
    const line = prompt
      .split('\n')
      .find((l) => l.startsWith('* Speaker: now-0'));
    expect(line).toBeDefined();
    expect(line!.length).toBeLessThanOrEqual(
      MAX_CHARS_PER_MESSAGE + '* Speaker: '.length,
    );
    expect(line).toMatch(/…$/);
  });

  it('keeps the whole prompt under the character budget with a fat history', () => {
    const conversations = [
      conversation('old', 12),
      conversation('mid', 12),
      conversation('current', 12),
    ];
    const prompt = buildSystemPrompt(userData(conversations), {
      desiredLength: 'M',
    });
    expect(prompt.length).toBeLessThanOrEqual(PROMPT_CHAR_BUDGET);
    // The current conversation always survives the trimming.
    expect(prompt).toContain('## Current conversation with the user');
    expect(prompt).toContain('current-11');
  });

  it('drops the oldest past conversation first when over budget', () => {
    const conversations = [
      conversation('old', 12),
      conversation('mid', 12),
      conversation('current', 12),
    ];
    const prompt = buildSystemPrompt(userData(conversations), {
      desiredLength: 'M',
    });
    // With every line clipped to 200 chars, at most one past conversation
    // fits alongside the 12-message current one: the most recent (mid) wins.
    if (prompt.includes('## Past conversations')) {
      expect(prompt).toContain('mid-');
      expect(prompt).not.toContain('old-');
    }
  });
});
