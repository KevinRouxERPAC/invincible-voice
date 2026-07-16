import {
  addFact,
  addStyleExchange,
  emptyUserMemory,
  extractStyleExchanges,
  hasMinimalSignal,
  isFactsProcessed,
  isProcessed,
  markFactsProcessed,
  markProcessed,
  MAX_FACTS,
  MAX_STYLE_EXCHANGES,
  normalizeUserMemory,
  pruneConversations,
  updateMemoryFromConversation,
} from '../memory';
import type { Conversation, ConversationMessage } from '../userData';

function writer(text: string): ConversationMessage {
  return { content: text, messageId: `id-${text}` };
}
function speaker(text: string): ConversationMessage {
  return { speaker: 'Friend', content: text };
}
function conv(messages: ConversationMessage[], when: string): Conversation {
  return { messages, start_time: when };
}

// --- Style exchange extraction ------------------------------------------------

describe('extractStyleExchanges', () => {
  test('pairs each user reply with the preceding speaker turn', () => {
    const messages = [
      speaker('Tu veux un café ?'),
      writer('Oui, volontiers, un petit noir.'),
      speaker('On y va ?'),
      writer("J'arrive de suite."),
    ];
    const exchanges = extractStyleExchanges(messages);
    expect(exchanges).toHaveLength(2);
    expect(exchanges[0]).toEqual({
      speaker_turn: 'Tu veux un café ?',
      user_reply: 'Oui, volontiers, un petit noir.',
    });
  });

  test('fuses consecutive speaker lines into one turn', () => {
    const messages = [
      speaker('Salut.'),
      speaker('Comment ça va ?'),
      writer('Ça va bien, merci.'),
    ];
    const exchanges = extractStyleExchanges(messages);
    expect(exchanges).toHaveLength(1);
    expect(exchanges[0].speaker_turn).toBe('Salut. Comment ça va ?');
  });

  test('a writer reply with no preceding speaker yields no exchange', () => {
    expect(extractStyleExchanges([writer('Bonjour à tous.')])).toEqual([]);
  });
});

// --- updateMemoryFromConversation --------------------------------------------

describe('updateMemoryFromConversation', () => {
  test('is idempotent', () => {
    const memory = emptyUserMemory();
    const c = conv(
      [speaker('Tu viens ce soir ?'), writer('Oui, je serai là à huit heures.')],
      '2026-07-10T10:00:00.000Z',
    );
    expect(updateMemoryFromConversation(memory, c)).toBe(true);
    expect(updateMemoryFromConversation(memory, c)).toBe(false);
    expect(memory.style_exchanges).toHaveLength(1);
  });

  test('skips trivially short replies', () => {
    const memory = emptyUserMemory();
    const c = conv(
      [speaker('Tu veux un café ?'), writer('Oui')],
      '2026-07-10T10:00:00.000Z',
    );
    updateMemoryFromConversation(memory, c);
    expect(memory.style_exchanges).toEqual([]);
  });

  test('marks a conversation processed even without signal', () => {
    const memory = emptyUserMemory();
    const c = conv([], '2026-07-10T10:00:00.000Z');
    updateMemoryFromConversation(memory, c);
    expect(isProcessed(memory, c.start_time)).toBe(true);
  });
});

// --- Fact dedup and capping --------------------------------------------------

describe('addFact', () => {
  test('deduplicates case-insensitively', () => {
    const memory = emptyUserMemory();
    const when = '2026-07-10T10:00:00.000Z';
    addFact(memory, 'Je suis allergique à la pénicilline.', when);
    addFact(memory, 'je suis allergique à la pénicilline', when);
    expect(memory.facts).toHaveLength(1);
  });

  test('caps at MAX_FACTS, keeping the most recent', () => {
    const memory = emptyUserMemory();
    const when = '2026-07-10T10:00:00.000Z';
    for (let i = 0; i < MAX_FACTS + 10; i++) {
      addFact(memory, `Fact number ${i}`, when);
    }
    expect(memory.facts).toHaveLength(MAX_FACTS);
    expect(memory.facts[MAX_FACTS - 1].text).toBe(
      `Fact number ${MAX_FACTS + 9}`,
    );
  });
});

describe('addStyleExchange', () => {
  test('caps at MAX_STYLE_EXCHANGES', () => {
    const memory = emptyUserMemory();
    for (let i = 0; i < MAX_STYLE_EXCHANGES + 5; i++) {
      addStyleExchange(
        memory,
        `Speaker turn ${i}`,
        `User reply with enough words ${i}`,
      );
    }
    expect(memory.style_exchanges).toHaveLength(MAX_STYLE_EXCHANGES);
  });
});

// --- Markers are independent -------------------------------------------------

describe('style and facts markers are independent', () => {
  test('marking processed does not mark facts processed', () => {
    const memory = emptyUserMemory();
    const when = '2026-07-10T10:00:00.000Z';
    markProcessed(memory, when);
    expect(isProcessed(memory, when)).toBe(true);
    expect(isFactsProcessed(memory, when)).toBe(false);
  });

  test('marking facts processed does not mark style processed', () => {
    const memory = emptyUserMemory();
    const when = '2026-07-10T10:00:00.000Z';
    markFactsProcessed(memory, when);
    expect(isFactsProcessed(memory, when)).toBe(true);
    expect(isProcessed(memory, when)).toBe(false);
  });
});

// --- pruneConversations ------------------------------------------------------

describe('pruneConversations', () => {
  test('keeps the most recent under cap', () => {
    const convs = Array.from({ length: 10 }, (_, i) =>
      conv([speaker(String(i))], `2026-07-${String(i + 1).padStart(2, '0')}T10:00:00Z`),
    );
    expect(pruneConversations(convs)).toHaveLength(10);
  });

  test('drops the oldest over cap', () => {
    const convs = Array.from({ length: 35 }, (_, i) =>
      conv([speaker(String(i))], `2026-07-${String((i % 28) + 1).padStart(2, '0')}T10:00:00Z`),
    );
    const pruned = pruneConversations(convs);
    expect(pruned).toHaveLength(30);
    expect(pruned[0].messages[0].content).toBe('5');
  });
});

// --- hasMinimalSignal --------------------------------------------------------

describe('hasMinimalSignal', () => {
  test('rejects empty and one-sided conversations', () => {
    expect(hasMinimalSignal([])).toBe(false);
    expect(hasMinimalSignal([speaker('Hello')])).toBe(false);
    expect(
      hasMinimalSignal([speaker('Hello'), writer('Salut toi')]),
    ).toBe(true);
  });
});

// --- normalizeUserMemory -----------------------------------------------------

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
