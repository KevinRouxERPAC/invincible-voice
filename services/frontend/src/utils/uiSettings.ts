// Client-side UI preferences (theme, high contrast mode, keyboard shortcuts layout)
// Persisted in localStorage like scanSettings.ts

const STORAGE_KEY = 'invincible-voice-ui-settings';

export const UI_SETTINGS_CHANGED_EVENT = 'ui-settings-changed';

export type ThemeMode = 'light' | 'dark';
export type ContrastMode = 'normal' | 'high';
export type KeyboardLayout = 'azerty' | 'qwerty';

export interface UiSettings {
  theme: ThemeMode;
  contrast: ContrastMode;
  keyboardLayout: KeyboardLayout;
  /** Global text-size multiplier applied to the root font-size (see --fz). */
  fontScale: number;
}

/** Discrete text-size steps offered in the accessibility panel. */
export const FONT_SCALE_STEPS = [1, 1.15, 1.3, 1.5] as const;
export const FONT_SCALE_BOUNDS = { min: 1, max: 1.5 } as const;

export const DEFAULT_UI_SETTINGS: UiSettings = {
  theme: 'light',
  contrast: 'normal',
  keyboardLayout: 'azerty',
  fontScale: 1,
};

function normalizeFontScale(value: unknown): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return DEFAULT_UI_SETTINGS.fontScale;
  }
  return Math.min(
    FONT_SCALE_BOUNDS.max,
    Math.max(FONT_SCALE_BOUNDS.min, value),
  );
}

function normalize(raw: Partial<UiSettings> | null): UiSettings {
  if (!raw) {
    return { ...DEFAULT_UI_SETTINGS };
  }
  return {
    theme: raw.theme === 'dark' ? 'dark' : 'light',
    contrast: raw.contrast === 'high' ? 'high' : 'normal',
    keyboardLayout: raw.keyboardLayout === 'qwerty' ? 'qwerty' : 'azerty',
    fontScale: normalizeFontScale(raw.fontScale),
  };
}

export function getUiSettings(): UiSettings {
  if (typeof localStorage === 'undefined') {
    return { ...DEFAULT_UI_SETTINGS };
  }
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return { ...DEFAULT_UI_SETTINGS };
    }
    return normalize(JSON.parse(stored) as Partial<UiSettings>);
  } catch {
    return { ...DEFAULT_UI_SETTINGS };
  }
}

export function setUiSettings(patch: Partial<UiSettings>): UiSettings {
  const next = normalize({ ...getUiSettings(), ...patch });
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Storage disabled/quota exceeded
    }
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent<UiSettings>(UI_SETTINGS_CHANGED_EVENT, {
        detail: next,
      }),
    );
  }
  return next;
}
