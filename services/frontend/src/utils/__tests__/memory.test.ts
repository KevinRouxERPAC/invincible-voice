import {
  emptyUserMemory,
  normalizeUserMemory,
} from '../memory';
import type { Conversation, ConversationMessage } from '../userData';

describe('emptyUserMemory', () => {
  test('returns a well-shaped empty memory', () => {
    expect(emptyUserMemory()).toEqual({
      facts: [],
      style_exchanges: [],
      tone_profile: { summary: null, updated_at: null },
      processed_conversations: [],
      facts_processed_conversations: [],
      conversations_since_tone_refresh: 0,
    });
  });
});

describe('normalizeUserMemory', () => {
  test('returns an empty memory for null/undefined/non-object', () => {
    expect(normalizeUserMemory(null).facts).toEqual([]);
    expect(normalizeUserMemory(undefined).facts).toEqual([]);
    expect(normalizeUserMemory('string').facts).toEqual([]);
  });

  test('coerces a legacy blob (no memory) into an empty memory', () => {
    const normalized = normalizeUserMemory({});
    expect(normalized).toEqual(emptyUserMemory());
  });

  test('keeps valid fields and drops malformed ones', () => {
    const normalized = normalizeUserMemory({
      facts: [{ text: 'OK', observed_at: '2026-07-10T10:00:00Z' }, { foo: 'bar' }],
      style_exchanges: [
        { speaker_turn: 'Q', user_reply: 'R' },
        { speaker_turn: 'X' }, // missing user_reply -> dropped
      ],
      tone_profile: { summary: 'Portrait.', updated_at: '2026-07-10T10:00:00Z' },
      processed_conversations: ['a', 123, 'b'],
      facts_processed_conversations: ['c'],
      conversations_since_tone_refresh: 2,
    });
    expect(normalized.facts).toHaveLength(1);
    expect(normalized.facts[0].text).toBe('OK');
    expect(normalized.style_exchanges).toHaveLength(1);
    expect(normalized.tone_profile.summary).toBe('Portrait.');
    expect(normalized.processed_conversations).toEqual(['a', 'b']);
    expect(normalized.conversations_since_tone_refresh).toBe(2);
  });

  test('rejects a malformed tone_profile', () => {
    const normalized = normalizeUserMemory({
      tone_profile: { summary: 123 },
    });
    expect(normalized.tone_profile.summary).toBeNull();
  });
});
