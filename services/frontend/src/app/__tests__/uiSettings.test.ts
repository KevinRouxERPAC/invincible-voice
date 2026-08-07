import {
  DEFAULT_UI_SETTINGS,
  FONT_SCALE_BOUNDS,
  getUiSettings,
  setUiSettings,
  UI_SETTINGS_CHANGED_EVENT,
} from '../../utils/uiSettings';

describe('uiSettings', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('returns the defaults when nothing is stored', () => {
    expect(getUiSettings()).toEqual(DEFAULT_UI_SETTINGS);
  });

  test('persists a partial patch and merges with previous values', () => {
    setUiSettings({ theme: 'dark', fontScale: 1.3 });
    const stored = getUiSettings();
    expect(stored.theme).toBe('dark');
    expect(stored.fontScale).toBe(1.3);
    expect(stored.contrast).toBe(DEFAULT_UI_SETTINGS.contrast);
    expect(stored.keyboardLayout).toBe(DEFAULT_UI_SETTINGS.keyboardLayout);
  });

  test('clamps fontScale into its bounds', () => {
    expect(setUiSettings({ fontScale: 0.1 }).fontScale).toBe(
      FONT_SCALE_BOUNDS.min,
    );
    expect(setUiSettings({ fontScale: 9 }).fontScale).toBe(
      FONT_SCALE_BOUNDS.max,
    );
  });

  test('normalizes invalid theme / contrast / layout', () => {
    // @ts-expect-error testing invalid input on purpose
    const result = setUiSettings({
      theme: 'neon',
      contrast: 'ultra',
      keyboardLayout: 'dvorak',
    });
    expect(result.theme).toBe('light');
    expect(result.contrast).toBe('normal');
    expect(result.keyboardLayout).toBe('azerty');
  });

  test('dispatches a change event with the new settings', () => {
    const listener = jest.fn();
    window.addEventListener(UI_SETTINGS_CHANGED_EVENT, listener);
    setUiSettings({ contrast: 'high' });
    expect(listener).toHaveBeenCalledTimes(1);
    const event = listener.mock.calls[0][0] as CustomEvent;
    expect(event.detail.contrast).toBe('high');
    window.removeEventListener(UI_SETTINGS_CHANGED_EVENT, listener);
  });

  test('applies theme, contrast and fontScale the same way ContextProvider does', () => {
    const applyUiSettings = () => {
      const settings = getUiSettings();
      const root = document.documentElement;
      if (settings.theme === 'dark') {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }
      if (settings.contrast === 'high') {
        root.classList.add('contrast');
      } else {
        root.classList.remove('contrast');
      }
      root.style.setProperty('--fz', String(settings.fontScale));
    };

    window.addEventListener(UI_SETTINGS_CHANGED_EVENT, applyUiSettings);
    document.documentElement.classList.remove('dark', 'contrast');
    document.documentElement.style.removeProperty('--fz');

    setUiSettings({ theme: 'dark', contrast: 'high', fontScale: 1.5 });
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.classList.contains('contrast')).toBe(true);
    expect(document.documentElement.style.getPropertyValue('--fz')).toBe('1.5');

    setUiSettings({ theme: 'light', contrast: 'normal', fontScale: 1 });
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(document.documentElement.classList.contains('contrast')).toBe(false);
    expect(document.documentElement.style.getPropertyValue('--fz')).toBe('1');

    window.removeEventListener(UI_SETTINGS_CHANGED_EVENT, applyUiSettings);
  });
});
