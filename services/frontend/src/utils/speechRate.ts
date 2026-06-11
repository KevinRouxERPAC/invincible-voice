// Playback speed for the synthesized speech (TTS).
//
// This is a per-device preference, independent of the backend user settings:
// it only changes how fast the already-generated audio is played back, via the
// Web Audio `playbackRate`. It therefore works identically on the web app and
// inside the Capacitor Android shell, and needs no backend round-trip.
const STORAGE_KEY = 'invincible-voice-speech-rate';

export const MIN_SPEECH_RATE = 0.5;
export const MAX_SPEECH_RATE = 1.5;
export const DEFAULT_SPEECH_RATE = 1.0;

function clamp(rate: number): number {
  if (Number.isNaN(rate)) {
    return DEFAULT_SPEECH_RATE;
  }
  return Math.min(MAX_SPEECH_RATE, Math.max(MIN_SPEECH_RATE, rate));
}

export function getSpeechRate(): number {
  if (typeof localStorage === 'undefined') {
    return DEFAULT_SPEECH_RATE;
  }
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === null) {
    return DEFAULT_SPEECH_RATE;
  }
  return clamp(parseFloat(raw));
}

export function setSpeechRate(rate: number): void {
  if (typeof localStorage === 'undefined') {
    return;
  }
  try {
    localStorage.setItem(STORAGE_KEY, String(clamp(rate)));
  } catch {
    // Storage disabled/quota exceeded: the rate just won't persist.
  }
}
