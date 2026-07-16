// Durable memory layer for the on-device / offline mode (TypeScript port of
// backend/memory.py).
//
// The product goal: a person who can no longer speak must keep the same tone
// and the same knowledge regardless of whether they are online (backend
// consolidates memory) or offline (the phone does it). The native app mirrors
// the server-side `UserMemory` so the on-device prompt builder can inject
// durable facts, the tone profile and contextual style exchanges exactly like
// the backend does.
//
// This is a *cache* derived from conversations: it can always be rebuilt. It is
// persisted in localStorage alongside the rest of the local profile
// (localUserData.ts) so an offline session still benefits from the distilled
// memory without a round-trip to the server.
//
// NOTE: this module intentionally does NOT import `userData.tsx`. The latter
// imports us (for the `UserMemory` field of `UserData`), so a cross-import
// would create a dependency cycle flagged by ESLint. We instead define the
// minimal structural shape we need and use local type guards.

// --- Minimal structural shape of conversation messages -----------------------
// A speaker message has a `speaker` field; a writer message has a `messageId`.
// Both carry `content`. This mirrors `userData.tsx` without importing it.
interface SpeakerMessageLike {
  speaker: string;
  content: string;
}
interface WriterMessageLike {
  messageId: string;
  content: string;
}
type ConversationMessageLike = SpeakerMessageLike | WriterMessageLike;

interface ConversationLike {
  messages: ConversationMessageLike[];
  start_time: string;
}

function isSpeakerLike(
  message: ConversationMessageLike,
): message is SpeakerMessageLike {
  return 'speaker' in message;
}

function isWriterLike(
  message: ConversationMessageLike,
): message is WriterMessageLike {
  return 'messageId' in message;
}

// --- Bounds (kept in sync with backend/memory.py) ----------------------------
// On-device we keep tighter caps than the server: the prompt runs in front of
// a small model under tight RAM/latency budgets, so every token counts. The
// server caps are in parentheses for reference.
export const MAX_FACTS = 50; // server: 50
export const MAX_STYLE_EXCHANGES = 12; // server: 15
export const MAX_STORED_CONVERSATIONS = 30; // server: 200

// Only conversations with at least this many user-chosen messages are worth
// mining for style/knowledge.
const MIN_MESSAGES_FOR_EXTRACTION = 2;
// Replies shorter than this (in words) teach nothing about tone and would
// crowd out more expressive examples.
const MIN_REPLY_WORDS = 2;

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

/** Coerce an unknown shape (from localStorage / server) into a valid memory. */
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

// --- Fact dedup / capping -----------------------------------------------------

function normalizeFact(text: string): string {
  const collapsed = text.toLowerCase().trim().replace(/\s+/g, ' ');
  return collapsed.replace(/[.,;:!?]+$/, '');
}

export function addFact(memory: UserMemory, text: string, when: string): void {
  const trimmed = text.trim();
  if (!trimmed) return;
  const normalized = normalizeFact(trimmed);
  const exists = memory.facts.some((f) => normalizeFact(f.text) === normalized);
  if (exists) return;
  memory.facts.push({ text: trimmed, observed_at: when });
  if (memory.facts.length > MAX_FACTS) {
    memory.facts = memory.facts.slice(-MAX_FACTS);
  }
}

export function addStyleExchange(
  memory: UserMemory,
  speakerTurn: string,
  userReply: string,
): void {
  const turn = speakerTurn.trim();
  const reply = userReply.trim();
  if (!turn || !reply) return;
  if (reply.split(/\s+/).length < MIN_REPLY_WORDS) return;
  memory.style_exchanges.push({ speaker_turn: turn, user_reply: reply });
  if (memory.style_exchanges.length > MAX_STYLE_EXCHANGES) {
    memory.style_exchanges = memory.style_exchanges.slice(-MAX_STYLE_EXCHANGES);
  }
}

// --- Markers ------------------------------------------------------------------

function mark(bucket: string[], when: string): void {
  if (bucket.includes(when)) return;
  bucket.push(when);
  if (bucket.length > MAX_STORED_CONVERSATIONS) {
    bucket.splice(0, bucket.length - MAX_STORED_CONVERSATIONS);
  }
}

export function markProcessed(
  memory: UserMemory,
  conversationStartTime: string,
): void {
  mark(memory.processed_conversations, conversationStartTime);
}

export function isProcessed(
  memory: UserMemory,
  conversationStartTime: string,
): boolean {
  return memory.processed_conversations.includes(conversationStartTime);
}

export function markFactsProcessed(
  memory: UserMemory,
  conversationStartTime: string,
): void {
  mark(memory.facts_processed_conversations, conversationStartTime);
}

export function isFactsProcessed(
  memory: UserMemory,
  conversationStartTime: string,
): boolean {
  return memory.facts_processed_conversations.includes(conversationStartTime);
}

// --- Synchronous extraction (LLM-free) ---------------------------------------

/**
 * Pair each user-chosen reply with the speaker turn(s) immediately before it.
 * Consecutive speaker lines fuse into one turn, mirroring a real conversation
 * rather than one-line ping-pong.
 */
export function extractStyleExchanges(
  messages: ConversationMessageLike[],
): StyleExchange[] {
  const exchanges: StyleExchange[] = [];
  const pendingSpeakerLines: string[] = [];

  messages.forEach((message) => {
    if (isSpeakerLike(message)) {
      const text = message.content.trim();
      if (text) pendingSpeakerLines.push(text);
      return;
    }
    if (isWriterLike(message)) {
      const reply = message.content.trim();
      if (!reply) {
        pendingSpeakerLines.length = 0;
        return;
      }
      if (pendingSpeakerLines.length > 0) {
        exchanges.push({
          speaker_turn: pendingSpeakerLines.join(' '),
          user_reply: reply,
        });
      }
      pendingSpeakerLines.length = 0;
    }
  });
  return exchanges;
}

/** Whether a conversation is worth mining at all. */
export function hasMinimalSignal(messages: ConversationMessageLike[]): boolean {
  const hasWriter = messages.some(isWriterLike);
  const hasSpeaker = messages.some(isSpeakerLike);
  return (
    hasWriter && hasSpeaker && messages.length >= MIN_MESSAGES_FOR_EXTRACTION
  );
}

/**
 * Fold one conversation into the durable memory, synchronously (LLM-free).
 * Extracts contextual style exchanges. Fact extraction is LLM-driven and only
 * happens server-side; offline we rely on the style pass + the facts already
 * distilled. Idempotent: calling it twice on the same conversation is a no-op.
 *
 * Returns true if anything changed.
 */
export function updateMemoryFromConversation(
  memory: UserMemory,
  conversation: ConversationLike,
): boolean {
  if (isProcessed(memory, conversation.start_time)) return false;

  const { messages } = conversation;
  if (!hasMinimalSignal(messages)) {
    markProcessed(memory, conversation.start_time);
    return false;
  }

  let changed = false;
  extractStyleExchanges(messages).forEach((exchange) => {
    const before = memory.style_exchanges.length;
    addStyleExchange(memory, exchange.speaker_turn, exchange.user_reply);
    if (memory.style_exchanges.length > before) changed = true;
  });

  markProcessed(memory, conversation.start_time);
  return changed;
}

/** Cap the number of stored conversations, keeping the most recent. */
export function pruneConversations(
  conversations: ConversationLike[],
): ConversationLike[] {
  if (conversations.length <= MAX_STORED_CONVERSATIONS) return conversations;
  return conversations.slice(-MAX_STORED_CONVERSATIONS);
}
