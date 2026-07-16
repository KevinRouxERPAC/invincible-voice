// Full local mirror of the user's data for the on-device / offline mode.
//
// The thin SettingsSnapshot (localSettingsCache) only kept quick phrases, voice
// and language — enough to *speak* offline, but not enough for the assistant to
// stay personalized. The persona (name, prompt, friends, keywords, documents)
// and the whole conversation history were lost the moment the backend became
// unreachable, so `learn_style` had nothing to learn from offline and the
// on-device prompt could not replay past conversations.
//
// This module persists the WHOLE UserData (settings + conversations) in
// localStorage so that, offline:
//   - the persona is preserved,
//   - past conversations are replayed into the on-device prompt,
//   - learn_style can mirror the user's real phrasing.
// Online it is kept in sync by mirroring every successful backend fetch, so the
// device always holds the latest server-side state to fall back on.

import type { Conversation, UserData, UserSettings } from './userData';

const STORAGE_KEY = 'invincible-voice-local-userdata';

// Bound how much history we keep on the device. The prompt only ever replays a
// handful of recent conversations, so there is no point growing localStorage
// (and the JSON parse cost) without limit. Kept in sync with memory.ts.
const MAX_STORED_CONVERSATIONS = 30;

// Self-contained skeleton used the first time we persist something locally
// before any full profile has been mirrored. Kept in sync with
// userData.tsx::LOCAL_USER_DATA but defined here to avoid a circular import.
// The memory layer is left undefined here; callers that need a well-shaped
// empty memory should use `emptyLocalUserData()` or rely on `loadLocalUserData`
// which normalizes it on read.
const EMPTY_LOCAL_USER_DATA: UserData = {
  email: '',
  user_id: 'local',
  user_settings: {
    name: '',
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
  },
  conversations: [],
};

/** The full locally-persisted profile, or null when nothing was stored yet. */
export function loadLocalUserData(): UserData | null {
  if (typeof localStorage === 'undefined') {
    return null;
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as UserData;
    // Guard against partially-written / legacy blobs: without user_settings the
    // rest of the app would crash, so treat it as "nothing stored".
    if (!parsed || typeof parsed !== 'object' || !parsed.user_settings) {
      return null;
    }
    if (!Array.isArray(parsed.conversations)) {
      parsed.conversations = [];
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Persist the full profile. The caller is responsible for folding new
 * conversations into the durable memory (see `updateMemoryFromConversation`)
 * and for pruning the history before calling; here we only write to storage.
 */
export function saveLocalUserData(data: UserData): void {
  if (typeof localStorage === 'undefined') {
    return;
  }
  try {
    const bounded: UserData = {
      ...data,
      conversations: (data.conversations ?? []).slice(
        -MAX_STORED_CONVERSATIONS,
      ),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bounded));
  } catch {
    // Quota exceeded or storage disabled: offline personalization will simply
    // be poorer, never fatal.
  }
}

/** Update only the settings of the stored profile (persona edited offline). */
export function saveLocalUserSettings(settings: UserSettings): void {
  const base = loadLocalUserData() ?? EMPTY_LOCAL_USER_DATA;
  saveLocalUserData({ ...base, user_settings: settings });
}

/**
 * Append a finished conversation to the stored history. This is the offline
 * equivalent of the backend saving on WebSocket disconnect: it is what lets the
 * on-device prompt replay past turns and feed learn_style next time. Empty
 * conversations are ignored so a session with no exchange leaves no trace.
 *
 * NOTE: this function does NOT fold the conversation into the durable memory.
 * Callers that want the style pass to run (the on-device conversation hook)
 * should call `updateMemoryFromConversation` on the profile's memory first,
 * then persist via this function — or use `appendLocalConversationWithMemory`
 * from the hook layer. Keeping memory logic out of this module avoids a
 * dependency cycle with `memory.ts` (imported by `userData.tsx`).
 */
export function appendLocalConversation(conversation: Conversation): void {
  if (!conversation.messages.length) {
    return;
  }
  const base = loadLocalUserData() ?? EMPTY_LOCAL_USER_DATA;
  saveLocalUserData({
    ...base,
    conversations: [...base.conversations, conversation],
  });
}

/**
 * Delete one stored conversation by its index in the (unsorted) history.
 *
 * This is the offline equivalent of the backend `DELETE
 * /v1/user/conversations/{id}`: in local/offline mode there is no backend to
 * call, so deletion must happen directly in localStorage. A no-op when the
 * index is out of range, so a stale index can never drop the wrong row.
 */
export function deleteLocalConversation(index: number): void {
  const base = loadLocalUserData();
  if (!base || index < 0 || index >= base.conversations.length) {
    return;
  }
  const conversations = [...base.conversations];
  conversations.splice(index, 1);
  saveLocalUserData({ ...base, conversations });
}

/**
 * Archive or unarchive one stored conversation by its index. Archiving is
 * display-only: the conversation stays in storage and keeps feeding the
 * durable memory / prompt. A no-op when the index is out of range.
 */
export function setLocalConversationArchived(
  index: number,
  archived: boolean,
): void {
  const base = loadLocalUserData();
  if (!base || index < 0 || index >= base.conversations.length) {
    return;
  }
  const conversations = base.conversations.map((conversation, i) =>
    i === index ? { ...conversation, archived } : conversation,
  );
  saveLocalUserData({ ...base, conversations });
}
