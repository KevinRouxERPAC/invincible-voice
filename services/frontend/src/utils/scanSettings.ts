// Motor-accessibility preferences (switch scanning & dwell selection).
//
// These are per-device preferences, independent of the backend user settings:
// they describe how the person physically drives the UI (a single switch
// emulated as a key, an eye-tracker emitting pointer events, a touch zone…),
// which is a property of the hardware in front of them, not of their account.
// Persisted in localStorage like the speech rate (see speechRate.ts), so they
// work identically on the web app and inside the Capacitor Android shell.
//
// A `scan-settings-changed` CustomEvent is dispatched on `window` whenever the
// settings change, so the running ScanProvider can react live without a reload.
const STORAGE_KEY = 'invincible-voice-scan-settings';

export const SCAN_SETTINGS_CHANGED_EVENT = 'scan-settings-changed';

export type ScanMode = 'off' | 'auto' | 'step' | 'dwell';

export interface ScanSettings {
  /** Which access mode is active. 'off' disables the whole engine. */
  mode: ScanMode;
  /** Auto-scan: how long the highlight rests on each target, in ms. */
  scanIntervalMs: number;
  /** Dwell: how long the pointer must rest on a target to select it, in ms. */
  dwellMs: number;
  /** Step-scan: press longer than this to select instead of advancing, in ms. */
  holdToSelectMs: number;
  /** The key that acts as the switch (default Space). Stored as KeyboardEvent.key. */
  switchKey: string;
  /** Enlarge hit targets for easier pointing. */
  bigTargets: boolean;
}

export const SCAN_INTERVAL_BOUNDS = { min: 600, max: 4000 } as const;
export const DWELL_BOUNDS = { min: 500, max: 4000 } as const;
export const HOLD_TO_SELECT_BOUNDS = { min: 300, max: 1500 } as const;

export const DEFAULT_SCAN_SETTINGS: ScanSettings = {
  mode: 'off',
  scanIntervalMs: 1500,
  dwellMs: 1200,
  holdToSelectMs: 600,
  switchKey: ' ',
  bigTargets: false,
};

const VALID_MODES: ScanMode[] = ['off', 'auto', 'step', 'dwell'];

function clamp(
  value: number,
  min: number,
  max: number,
  fallback: number,
): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, value));
}

function normalize(raw: Partial<ScanSettings> | null): ScanSettings {
  if (!raw) {
    return { ...DEFAULT_SCAN_SETTINGS };
  }
  return {
    mode: VALID_MODES.includes(raw.mode as ScanMode)
      ? (raw.mode as ScanMode)
      : DEFAULT_SCAN_SETTINGS.mode,
    scanIntervalMs: clamp(
      raw.scanIntervalMs as number,
      SCAN_INTERVAL_BOUNDS.min,
      SCAN_INTERVAL_BOUNDS.max,
      DEFAULT_SCAN_SETTINGS.scanIntervalMs,
    ),
    dwellMs: clamp(
      raw.dwellMs as number,
      DWELL_BOUNDS.min,
      DWELL_BOUNDS.max,
      DEFAULT_SCAN_SETTINGS.dwellMs,
    ),
    holdToSelectMs: clamp(
      raw.holdToSelectMs as number,
      HOLD_TO_SELECT_BOUNDS.min,
      HOLD_TO_SELECT_BOUNDS.max,
      DEFAULT_SCAN_SETTINGS.holdToSelectMs,
    ),
    switchKey:
      typeof raw.switchKey === 'string' && raw.switchKey.length > 0
        ? raw.switchKey
        : DEFAULT_SCAN_SETTINGS.switchKey,
    bigTargets: Boolean(raw.bigTargets),
  };
}

export function getScanSettings(): ScanSettings {
  if (typeof localStorage === 'undefined') {
    return { ...DEFAULT_SCAN_SETTINGS };
  }
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return { ...DEFAULT_SCAN_SETTINGS };
    }
    return normalize(JSON.parse(stored) as Partial<ScanSettings>);
  } catch {
    return { ...DEFAULT_SCAN_SETTINGS };
  }
}

export function setScanSettings(patch: Partial<ScanSettings>): ScanSettings {
  const next = normalize({ ...getScanSettings(), ...patch });
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Storage disabled/quota exceeded: the change just won't persist.
    }
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent<ScanSettings>(SCAN_SETTINGS_CHANGED_EVENT, {
        detail: next,
      }),
    );
  }
  return next;
}
