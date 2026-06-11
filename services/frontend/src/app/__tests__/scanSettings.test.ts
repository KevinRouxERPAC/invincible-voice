import {
  DEFAULT_SCAN_SETTINGS,
  getScanSettings,
  SCAN_INTERVAL_BOUNDS,
  SCAN_SETTINGS_CHANGED_EVENT,
  setScanSettings,
} from '../../utils/scanSettings';

describe('scanSettings', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('returns the defaults when nothing is stored', () => {
    expect(getScanSettings()).toEqual(DEFAULT_SCAN_SETTINGS);
  });

  test('persists a partial patch and merges with previous values', () => {
    setScanSettings({ mode: 'auto', scanIntervalMs: 1200 });
    const stored = getScanSettings();
    expect(stored.mode).toBe('auto');
    expect(stored.scanIntervalMs).toBe(1200);
    // Untouched fields keep their defaults.
    expect(stored.dwellMs).toBe(DEFAULT_SCAN_SETTINGS.dwellMs);
  });

  test('clamps numeric values into their bounds', () => {
    const tooFast = setScanSettings({ scanIntervalMs: 10 });
    expect(tooFast.scanIntervalMs).toBe(SCAN_INTERVAL_BOUNDS.min);
    const tooSlow = setScanSettings({ scanIntervalMs: 999999 });
    expect(tooSlow.scanIntervalMs).toBe(SCAN_INTERVAL_BOUNDS.max);
  });

  test('rejects an unknown mode and falls back to the default', () => {
    // @ts-expect-error testing invalid input on purpose
    const result = setScanSettings({ mode: 'nonsense' });
    expect(result.mode).toBe(DEFAULT_SCAN_SETTINGS.mode);
  });

  test('recovers from corrupted storage', () => {
    localStorage.setItem('invincible-voice-scan-settings', '{not json');
    expect(getScanSettings()).toEqual(DEFAULT_SCAN_SETTINGS);
  });

  test('dispatches a change event with the new settings', () => {
    const listener = jest.fn();
    window.addEventListener(SCAN_SETTINGS_CHANGED_EVENT, listener);
    setScanSettings({ mode: 'dwell' });
    expect(listener).toHaveBeenCalledTimes(1);
    const event = listener.mock.calls[0][0] as CustomEvent;
    expect(event.detail.mode).toBe('dwell');
    window.removeEventListener(SCAN_SETTINGS_CHANGED_EVENT, listener);
  });
});
