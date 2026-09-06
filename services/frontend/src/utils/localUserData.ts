// Local mirror of the user's data for the native (Capacitor) app.
//
// The thin SettingsSnapshot (localSettingsCache) only keeps quick phrases,
// voice and language — enough to *speak* offline (SOS, quick phrases, free
// text with the phone's TTS), but nothing more. Offline is a degraded
// survival mode by design: there is no on-device LLM, so suggestions cannot
// be generated without the backend, and the durable memory is server-side
// only (see memory.ts).
//
// This module persists the UserData profile (settings + conversation history)
// in localStorage, mirrored on every successful backend fetch, so that when
// the backend is unreachable the user keeps their persona, phrases and
// history display. It never generates or transforms data on its own.

import type { UserData, UserSettings } from './userData';

const STORAGE_KEY = 'invincible-voice-local-userdata';

// Bound how much history we keep on the device (display only). The backend
// caps its own stored history; this cap just keeps localStorage (and the JSON
// parse cost) bounded on the phone.
const MAX_STORED_CONVERSATIONS = 30;

// Self-contained skeleton used the first time we persist something locally
// before any full profile has been mirrored. Kept in sync with
// userData.tsx::LOCAL_USER_DATA but defined here to avoid a circular import.
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

/** Persist the full profile (a mirrored backend payload, already normalized). */
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
    // Quota exceeded or storage disabled: the offline fallback will just be
    // emptier, never fatal.
  }
}

/** Update only the settings of the stored profile (persona edited offline). */
export function saveLocalUserSettings(settings: UserSettings): void {
  const base = loadLocalUserData() ?? EMPTY_LOCAL_USER_DATA;
  saveLocalUserData({ ...base, user_settings: settings });
}

/**
 * Delete one stored conversation by its index in the (unsorted) history.
 *
 * This mirrors the backend `DELETE /v1/user/conversations/{id}` into the local
 * cache so a later offline session doesn't resurrect the conversation from
 * stale localStorage. A no-op when the index is out of range, so a stale index
 * can never drop the wrong row.
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
 * display-only: the conversation stays in storage. Mirrors the backend PATCH
 * into the local cache. A no-op when the index is out of range.
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
