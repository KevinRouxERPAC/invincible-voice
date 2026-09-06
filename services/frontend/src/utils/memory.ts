// TypeScript mirror of the backend `UserMemory` payload (backend/memory.py).
//
// The durable memory layer — personal facts, contextual style exchanges and
// the LLM-generated tone profile — is built and consolidated SERVER-SIDE only:
// the backend folds conversations into memory (sync style pass + LLM pass) and
// injects it into the LLM prompt. There is deliberately no on-device
// equivalent: offline the LLM is unreachable, so suggestions (the only
// consumer of this data) cannot be generated anyway. The frontend merely
// normalizes and displays what the server sends (SettingsPopup memory card).
//
// NOTE: this module intentionally does NOT import `userData.tsx`. The latter
// imports us (for the `UserMemory` field of `UserData`), so a cross-import
// would create a dependency cycle flagged by ESLint.

// --- Data models --------------------------------------------------------------

export interface MemoryFact {
  text: string;
  /** ISO 8601 string of when the fact was first observed. */
  observed_at: string;
}

export interface StyleExchange {
  /** The speaker turn(s) immediately preceding the user's reply. */
  speaker_turn: string;
  /** The reply the user actually chose. */
  user_reply: string;
}

export interface ToneProfile {
  /** Null until the first profile has been generated. */
  summary: string | null;
  /** ISO 8601 string of when the profile was last refreshed. */
  updated_at: string | null;
}

export interface UserMemory {
  facts: MemoryFact[];
  style_exchanges: StyleExchange[];
  tone_profile: ToneProfile;
  /** Conversations already folded in by the synchronous style pass. */
  processed_conversations: string[];
  /**
   * Conversations mined by the LLM pass (fact extraction + tone). Kept
   * separate from processed_conversations on purpose: the sync style pass
   * marks a conversation processed at session end, so a shared marker would
   * make the LLM pass skip every conversation and never extract a fact.
   */
  facts_processed_conversations: string[];
  /** Conversations mined since the tone profile was last refreshed. */
  conversations_since_tone_refresh: number;
}

export function emptyUserMemory(): UserMemory {
  return {
    facts: [],
    style_exchanges: [],
    tone_profile: { summary: null, updated_at: null },
    processed_conversations: [],
    facts_processed_conversations: [],
    conversations_since_tone_refresh: 0,
  };
}

// --- Normalization (server payloads and local mirrors) ------------------------

function isMemoryFact(x: unknown): x is MemoryFact {
  return (
    !!x &&
    typeof x === 'object' &&
    typeof (x as MemoryFact).text === 'string' &&
    typeof (x as MemoryFact).observed_at === 'string'
  );
}

function isStyleExchange(x: unknown): x is StyleExchange {
  return (
    !!x &&
    typeof x === 'object' &&
    typeof (x as StyleExchange).speaker_turn === 'string' &&
    typeof (x as StyleExchange).user_reply === 'string'
  );
}

function isToneProfile(x: unknown): x is ToneProfile {
  if (!x || typeof x !== 'object') return false;
  const tp = x as Partial<ToneProfile>;
  return (
    (tp.summary === null || typeof tp.summary === 'string') &&
    (tp.updated_at === null || typeof tp.updated_at === 'string')
  );
}

/** Coerce an unknown shape (from the server / a local mirror) into a valid memory. */
export function normalizeUserMemory(input: unknown): UserMemory {
  const empty = emptyUserMemory();
  if (!input || typeof input !== 'object') return empty;
  const m = input as Partial<UserMemory>;
  return {
    facts: Array.isArray(m.facts) ? m.facts.filter(isMemoryFact) : [],
    style_exchanges: Array.isArray(m.style_exchanges)
      ? m.style_exchanges.filter(isStyleExchange)
      : [],
    tone_profile: isToneProfile(m.tone_profile)
      ? m.tone_profile
      : empty.tone_profile,
    processed_conversations: Array.isArray(m.processed_conversations)
      ? m.processed_conversations.filter((x) => typeof x === 'string')
      : [],
    facts_processed_conversations: Array.isArray(
      m.facts_processed_conversations,
    )
      ? m.facts_processed_conversations.filter((x) => typeof x === 'string')
      : [],
    conversations_since_tone_refresh:
      typeof m.conversations_since_tone_refresh === 'number'
        ? m.conversations_since_tone_refresh
        : 0,
  };
}
