// Hybrid LLM mode switches (native app only).
//
// The native app prefers the cloud backend (Cerebras) whenever it is reachable,
// because a 1.5B on-device model gives noticeably weaker suggestions. When the
// backend cannot be reached it falls back to the on-device model, so the app
// keeps working offline (airplane mode included). STT and TTS are always native.
//
// Two distinct notions, deliberately kept apart:
//
//   isLocalMode()     — the on-device fallback is available. ON by default on
//                       native: an AAC app that dies without network is useless.
//                       The user can turn it off in Settings to reclaim ~1 GB.
//
//   isLocalOnlyMode() — this build never talks to a backend at all: no auth, no
//                       user sync. Opt-in at build time only
//                       (NEXT_PUBLIC_LOCAL_MODE=1), because it disables login.

import { isNativeApp } from '@/utils/platform';

const STORAGE_KEY = 'iv_local_mode';

/**
 * A build compiled to run with no backend whatsoever. This disables the login
 * flow, so it must never be inferred — only an explicit build flag turns it on.
 */
export function isLocalOnlyMode(): boolean {
  return isNativeApp() && process.env.NEXT_PUBLIC_LOCAL_MODE === '1';
}

/** Whether the on-device fallback is turned on (independent of platform). */
export function isLocalModeEnabled(): boolean {
  if (process.env.NEXT_PUBLIC_LOCAL_MODE === '1') {
    return true;
  }
  if (process.env.NEXT_PUBLIC_LOCAL_MODE === '0') {
    return false;
  }
  if (typeof window === 'undefined') {
    return false;
  }
  try {
    // Absent from storage = never chosen = default on. Only an explicit '0'
    // (the user turning it off in Settings) disables the fallback.
    return window.localStorage.getItem(STORAGE_KEY) !== '0';
  } catch {
    return true;
  }
}

export function setLocalModeEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0');
  } catch {
    // Ignore storage errors: the build-time flag still applies.
  }
}

/** True only when running natively AND the on-device fallback is allowed. */
export function isLocalMode(): boolean {
  return isNativeApp() && isLocalModeEnabled();
}
