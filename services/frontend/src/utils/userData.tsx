// TypeScript types equivalent to the Pydantic models in services/backend/backend/storage.py
import { addAuthHeaders, getBearerToken } from '../auth/authUtils';
import { isNativeApp } from '@/utils/platform';
import { apiUrl } from './backend';
import { isLocalMode, isLocalOnlyMode } from './localMode';
import { loadSettingsSnapshot } from './localSettingsCache';
import {
  deleteLocalConversation,
  loadLocalUserData,
  saveLocalUserData,
  saveLocalUserSettings,
  setLocalConversationArchived,
} from './localUserData';
import { UserMemory, emptyUserMemory, normalizeUserMemory } from './memory';

/**
 * Represents a message from a speaker (user input)
 */
export interface SpeakerMessage {
  speaker: string;
  content: string;
}

/**
 * Represents a message from the writer (AI response)
 */
export interface WriterMessage {
  content: string;
  messageId: string; // UUID as string in TypeScript
}

/**
 * Union type for conversation messages
 */
export type ConversationMessage = SpeakerMessage | WriterMessage;

/**
 * Represents a conversation containing multiple messages
 */
export interface Conversation {
  messages: ConversationMessage[];
  start_time: string; // ISO 8601 datetime string from backend
  // Display-only flag: an archived conversation is hidden from the main
  // history list (shown in a separate "Archived" section) but is NOT deleted
  // and keeps feeding the durable memory / prompt exactly like any other. It
  // is optional so legacy blobs without the field are treated as not archived.
  archived?: boolean;
}

/**
 * Represents a document with title and content
 */
export interface Document {
  title: string;
  content: string;
}

/**
 * A pre-written phrase the user can speak instantly, without the LLM.
 * Grouped by free-form category in the UI.
 */
export interface QuickPhrase {
  text: string;
  category: string;
}

/**
 * A prepared script for a specific situation (e.g. a doctor's visit): an
 * ordered list of phrases the user steps through one by one.
 */
export interface Appointment {
  title: string;
  phrases: string[];
}

/**
 * User settings and preferences
 */
export interface UserSettings {
  name: string;
  prompt: string;
  additional_keywords: string[];
  friends: string[];
  documents: Document[];
  quick_phrases: QuickPhrase[];
  appointments?: Appointment[];
  voice: string | null;
  expected_transcription_language: string | null;
  accepted_terms_of_services: boolean;
  /** When true, the LLM adapts its suggestions to the user's past phrasings. */
  learn_style?: boolean;
}

/**
 * Complete user data structure
 */
export interface UserData {
  email: string;
  user_id: string; // UUID as string in TypeScript
  user_settings: UserSettings;
  conversations: Conversation[];
  /**
   * Durable, distilled memory layer: personal facts, contextual style
   * exchanges, and the LLM-generated tone profile. Mirrors the backend
   * `UserMemory`. Derived from conversations so it can always be rebuilt;
   * absent on legacy profiles (normalized to an empty memory).
   */
  memory?: UserMemory;
}

/**
 * Type guard to check if a message is from a speaker
 */
export function isSpeakerMessage(
  message: ConversationMessage,
): message is SpeakerMessage {
  return 'speaker' in message;
}

/**
 * Type guard to check if a message is from a writer
 */
export function isWriterMessage(
  message: ConversationMessage,
): message is WriterMessage {
  return 'messageId' in message;
}

/**
 * API response wrapper for error handling
 */
interface ApiResponse<T> {
  data?: T;
  error?: string;
  status: number;
}

/**
 * Self-contained anonymous profile used in 100%-local mode (no backend).
 * Keeps default quick phrases / appointments empty; the user can still
 * configure them in Settings — they just won't be persisted server-side.
 */
export const LOCAL_USER_DATA: UserData = {
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
  memory: emptyUserMemory(),
};

/**
 * Fetches user data from the backend API
 * GET /v1/user/
 *
 * @returns Promise<ApiResponse<UserData>>
 */
/**
 * The offline profile, enriched with whatever we cached the last time the
 * backend answered. Without the snapshot the user would lose their quick
 * phrases and voice exactly when they need them most — offline.
 *
 * Preference order:
 *   1. The full locally-persisted profile (settings + conversation history),
 *      so the persona stays intact and the on-device model keeps learning.
 *   2. The thin settings snapshot (quick phrases / voice / language only), kept
 *      for backward compatibility with installs that predate the full mirror.
 *   3. The empty anonymous profile.
 */
function buildLocalUserData(): UserData {
  const stored = loadLocalUserData();
  if (stored) {
    // Normalize the durable memory: a legacy blob (predating the memory
    // layer) would have `memory` undefined. We coerce it to a valid empty
    // memory so the on-device prompt builder always has a well-shaped layer.
    return { ...stored, memory: normalizeUserMemory(stored.memory) };
  }
  const snapshot = loadSettingsSnapshot();
  if (!snapshot) {
    return LOCAL_USER_DATA;
  }
  return {
    ...LOCAL_USER_DATA,
    user_settings: {
      ...LOCAL_USER_DATA.user_settings,
      quick_phrases: snapshot.quick_phrases,
      voice: snapshot.voice,
      expected_transcription_language: snapshot.expected_transcription_language,
    },
  };
}

export async function getUserData(): Promise<ApiResponse<UserData>> {
  // Backend-less build: never touch the network, not even to fail.
  if (isLocalOnlyMode()) {
    return { data: buildLocalUserData(), status: 200 };
  }

  try {
    // Logged-in users (native included) read their own profile. The shared
    // anonymous profile is only for native builds on trusted/LAN deployments
    // that explicitly allow it (ALLOW_ANONYMOUS_USER=1) — public backends
    // close it, so it must never be used once a token exists.
    const useAnonymous = isNativeApp() && !getBearerToken();
    const url = apiUrl(useAnonymous ? `/v1/user/anonymous` : `/v1/user/`);

    const response = await fetch(url, {
      method: 'GET',
      headers: addAuthHeaders({
        'Content-Type': 'application/json',
      }),
    });

    if (!response.ok) {
      return {
        error: `Failed to fetch user data: ${response.status} ${response.statusText}`,
        status: response.status,
      };
    }

    const data: UserData = await response.json();

    // The server sends the durable memory layer (facts / tone profile /
    // style exchanges). Normalize defensively: a legacy or partial payload
    // would otherwise leave `memory` undefined and the on-device prompt
    // builder would silently lose the distilled knowledge.
    const dataWithMemory: UserData = {
      ...data,
      memory: normalizeUserMemory(data.memory),
    };

    // On native, mirror the freshly-fetched profile (settings + history +
    // memory) so the on-device/offline mode can fall back to the latest
    // server-side state instead of an empty profile.
    if (isLocalMode()) {
      saveLocalUserData(dataWithMemory);
    }

    return {
      data: dataWithMemory,
      status: response.status,
    };
  } catch (error) {
    // Unreachable backend (airplane mode, no coverage). On native we can still
    // run entirely on-device, so hand back a local profile instead of failing.
    // The web build has nothing to fall back to.
    if (isLocalMode()) {
      return {
        data: buildLocalUserData(),
        status: 200,
      };
    }
    return {
      error: `Network error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      status: 0,
    };
  }
}

/**
 * Updates user settings on the backend API
 * POST /v1/user/settings
 *
 * @param settings - The updated user settings
 * @returns Promise<ApiResponse<void>>
 */
export async function updateUserSettings(
  settings: UserSettings,
): Promise<ApiResponse<void>> {
  // On native, mirror the persona locally first so an offline edit is never
  // lost, and so the on-device prompt uses the updated profile immediately.
  if (isLocalMode()) {
    saveLocalUserSettings(settings);
  }
  // Backend-less build: there is no server to POST to, and the network must
  // never be touched. The local mirror above is the source of truth.
  if (isLocalOnlyMode()) {
    return { status: 200 };
  }

  try {
    const url = apiUrl(`/v1/user/settings`);

    const response = await fetch(url, {
      method: 'POST',
      headers: addAuthHeaders({
        'Content-Type': 'application/json',
      }),
      body: JSON.stringify(settings),
    });

    if (!response.ok) {
      return {
        error: `Failed to update user settings: ${response.status} ${response.statusText}`,
        status: response.status,
      };
    }

    return {
      status: response.status,
    };
  } catch (error) {
    return {
      error: `Network error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      status: 0,
    };
  }
}

/**
 * Deletes a conversation from the backend API
 * DELETE /v1/user/conversations/{conversation_id}
 *
 * @param conversationId - The index of the conversation to delete
 * @returns Promise<ApiResponse<void>>
 */
export async function deleteConversation(
  conversationId: number,
): Promise<ApiResponse<void>> {
  // Local-only build: there is no backend to call. Deleting via a network
  // request would fail (and be blocked as mixed content), so the delete button
  // would silently do nothing. Persist the deletion directly in localStorage.
  if (isLocalOnlyMode()) {
    deleteLocalConversation(conversationId);
    return { status: 200 };
  }
  try {
    const url = apiUrl(`/v1/user/conversations/${conversationId}`);

    const response = await fetch(url, {
      method: 'DELETE',
      headers: addAuthHeaders({
        'Content-Type': 'application/json',
      }),
    });

    if (!response.ok) {
      return {
        error: `Failed to delete conversation: ${response.status} ${response.statusText}`,
        status: response.status,
      };
    }

    // Mirror the deletion into the local cache so an offline session doesn't
    // resurrect the conversation from stale localStorage.
    deleteLocalConversation(conversationId);
    return {
      status: response.status,
    };
  } catch (error) {
    return {
      error: `Network error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      status: 0,
    };
  }
}

/**
 * Archive or unarchive a conversation. Display-only: the conversation is never
 * deleted and keeps feeding the durable memory / prompt. Mirrors the delete
 * flow — local/offline persists to localStorage, online hits the backend and
 * mirrors the change locally.
 */
export async function setConversationArchived(
  conversationId: number,
  archived: boolean,
): Promise<ApiResponse<void>> {
  if (isLocalOnlyMode()) {
    setLocalConversationArchived(conversationId, archived);
    return { status: 200 };
  }
  try {
    const url = apiUrl(`/v1/user/conversations/${conversationId}`);

    const response = await fetch(url, {
      method: 'PATCH',
      headers: addAuthHeaders({
        'Content-Type': 'application/json',
      }),
      body: JSON.stringify({ archived }),
    });

    if (!response.ok) {
      return {
        error: `Failed to archive conversation: ${response.status} ${response.statusText}`,
        status: response.status,
      };
    }

    setLocalConversationArchived(conversationId, archived);
    return {
      status: response.status,
    };
  } catch (error) {
    return {
      error: `Network error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      status: 0,
    };
  }
}

/**
 * Fetches available voices from the backend API
 * GET /v1/voices
 *
 * @returns Promise<ApiResponse<Record<string, string>>>
 */
export async function getVoices(): Promise<
  ApiResponse<Record<string, string>>
> {
  try {
    const url = apiUrl(`/v1/voices`);

    const response = await fetch(url, {
      method: 'GET',
      headers: addAuthHeaders({
        'Content-Type': 'application/json',
      }),
    });

    if (!response.ok) {
      return {
        error: `Failed to fetch voices: ${response.status} ${response.statusText}`,
        status: response.status,
      };
    }

    const data: Record<string, string> = await response.json();

    return {
      data,
      status: response.status,
    };
  } catch (error) {
    return {
      error: `Network error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      status: 0,
    };
  }
}

/**
 * Selects a voice for the user
 * POST /v1/voices/select
 *
 * @param voice - The voice to select
 * @returns Promise<ApiResponse<{ voice: string }>>
 */
export async function selectVoice(
  voice: string,
): Promise<ApiResponse<{ voice: string }>> {
  try {
    const url = apiUrl(`/v1/voices/select`);

    const response = await fetch(url, {
      method: 'POST',
      headers: addAuthHeaders({
        'Content-Type': 'application/json',
      }),
      body: JSON.stringify({ voice }),
    });

    if (!response.ok) {
      return {
        error: `Failed to select voice: ${response.status} ${response.statusText}`,
        status: response.status,
      };
    }

    const data: { voice: string } = await response.json();

    return {
      data,
      status: response.status,
    };
  } catch (error) {
    return {
      error: `Network error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      status: 0,
    };
  }
}

/**
 * Creates a new voice by uploading an audio file
 * POST /v1/voices/create
 *
 * @param audioFile - The audio file (WAV) to use for voice cloning
 * @param name - The name for the new voice
 * @returns Promise<ApiResponse<{ uid: string; name: string }>>
 */
export async function createVoice(
  audioFile: File,
  name: string,
): Promise<ApiResponse<{ uid: string; name: string }>> {
  try {
    const url = apiUrl(`/v1/voices/create`);

    const formData = new FormData();
    formData.append('audio_file', audioFile);
    formData.append('name', name);

    const response = await fetch(url, {
      method: 'POST',
      headers: addAuthHeaders({}),
      body: formData,
    });

    if (!response.ok) {
      return {
        error: `Failed to create voice: ${response.status} ${response.statusText}`,
        status: response.status,
      };
    }

    const data: { uid: string; name: string } = await response.json();

    return {
      data,
      status: response.status,
    };
  } catch (error) {
    return {
      error: `Network error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      status: 0,
    };
  }
}

/**
 * Deletes a custom voice
 * DELETE /v1/voices?voice_name={voice_name}
 *
 * @param voiceName - The name of the voice to delete
 * @returns Promise<ApiResponse<{ message: string; name: string }>>
 */
export async function deleteVoice(
  voiceName: string,
): Promise<ApiResponse<{ message: string; name: string }>> {
  try {
    const url = apiUrl(
      `/v1/voices?voice_name=${encodeURIComponent(voiceName)}`,
    );

    const response = await fetch(url, {
      method: 'DELETE',
      headers: addAuthHeaders({
        'Content-Type': 'application/json',
      }),
    });

    if (!response.ok) {
      return {
        error: `Failed to delete voice: ${response.status} ${response.statusText}`,
        status: response.status,
      };
    }

    const data: { message: string; name: string } = await response.json();

    return {
      data,
      status: response.status,
    };
  } catch (error) {
    return {
      error: `Network error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      status: 0,
    };
  }
}
