// Snapshot of the user settings needed by the offline fallback mode.
//
// The backend is the source of truth for user settings, but when it is
// unreachable we still need the quick phrases (and the voice/language they
// were cached with) to let the user speak. We persist a minimal snapshot in
// localStorage on every successful fetch.
import { QuickPhrase, UserSettings } from './userData';

const STORAGE_KEY = 'invincible-voice-settings-snapshot';

export interface SettingsSnapshot {
  quick_phrases: QuickPhrase[];
  voice: string | null;
  expected_transcription_language: string | null;
}

export function saveSettingsSnapshot(settings: UserSettings): void {
  if (typeof localStorage === 'undefined') {
    return;
  }
  const snapshot: SettingsSnapshot = {
    quick_phrases: settings.quick_phrases || [],
    voice: settings.voice ?? null,
    expected_transcription_language:
      settings.expected_transcription_language ?? null,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // Quota exceeded or storage disabled: the fallback will just be emptier
  }
}

export function loadSettingsSnapshot(): SettingsSnapshot | null {
  if (typeof localStorage === 'undefined') {
    return null;
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as SettingsSnapshot;
    return {
      quick_phrases: Array.isArray(parsed.quick_phrases)
        ? parsed.quick_phrases
        : [],
      voice: parsed.voice ?? null,
      expected_transcription_language:
        parsed.expected_transcription_language ?? null,
    };
  } catch {
    return null;
  }
}
