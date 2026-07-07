'use client';

import { FC, useCallback, useEffect, useState } from 'react';
import { useTranslations, useLocale } from '@/i18n';
import {
  DWELL_BOUNDS,
  getScanSettings,
  SCAN_INTERVAL_BOUNDS,
  ScanMode,
  setScanSettings,
  ScanSettings,
} from '@/utils/scanSettings';
import {
  FONT_SCALE_STEPS,
  getUiSettings,
  setUiSettings,
  UiSettings,
} from '@/utils/uiSettings';

const MODES: ScanMode[] = ['off', 'auto', 'step', 'dwell'];
const MODE_LABEL_KEY: Record<ScanMode, string> = {
  off: 'settings.accessModeOff',
  auto: 'settings.accessModeAuto',
  step: 'settings.accessModeStep',
  dwell: 'settings.accessModeDwell',
};

const UI_TRANSLATIONS = {
  fr: {
    uiSettings: 'Affichage & Disposition',
    textSize: 'Taille du texte',
    theme: 'Thème visuel',
    themeLight: 'Clair',
    themeDark: 'Sombre',
    contrast: 'Contraste',
    contrastNormal: 'Normal',
    contrastHigh: 'Élevé',
    keyboardLayout: 'Raccourcis clavier (réponses)',
    keyboardLayoutAzerty: 'AZERTY (A-Z-Q-S)',
    keyboardLayoutQwerty: 'QWERTY (A-S-D-F)',
  },
  en: {
    uiSettings: 'Display & Layout',
    textSize: 'Text size',
    theme: 'Visual Theme',
    themeLight: 'Light',
    themeDark: 'Dark',
    contrast: 'Contrast',
    contrastNormal: 'Normal',
    contrastHigh: 'High',
    keyboardLayout: 'Keyboard Shortcuts (responses)',
    keyboardLayoutAzerty: 'AZERTY (A-Z-Q-S)',
    keyboardLayoutQwerty: 'QWERTY (A-S-D-F)',
  },
  de: {
    uiSettings: 'Anzeige & Layout',
    textSize: 'Textgröße',
    theme: 'Design',
    themeLight: 'Hell',
    themeDark: 'Dunkel',
    contrast: 'Kontrast',
    contrastNormal: 'Normal',
    contrastHigh: 'Hoch',
    keyboardLayout: 'Tastaturkurzbefehle (Antworten)',
    keyboardLayoutAzerty: 'AZERTY (A-Z-Q-S)',
    keyboardLayoutQwerty: 'QWERTY (A-S-D-F)',
  },
  es: {
    uiSettings: 'Pantalla y Diseño',
    textSize: 'Tamaño del texto',
    theme: 'Tema visual',
    themeLight: 'Claro',
    themeDark: 'Oscuro',
    contrast: 'Contraste',
    contrastNormal: 'Normal',
    contrastHigh: 'Alto',
    keyboardLayout: 'Atajos de teclado (respuestas)',
    keyboardLayoutAzerty: 'AZERTY (A-Z-Q-S)',
    keyboardLayoutQwerty: 'QWERTY (A-S-D-F)',
  },
  pt: {
    uiSettings: 'Tela e Layout',
    textSize: 'Tamanho do texto',
    theme: 'Tema visual',
    themeLight: 'Claro',
    themeDark: 'Escuro',
    contrast: 'Contraste',
    contrastNormal: 'Normal',
    contrastHigh: 'Alto',
    keyboardLayout: 'Atalhos de teclado (respostas)',
    keyboardLayoutAzerty: 'AZERTY (A-Z-Q-S)',
    keyboardLayoutQwerty: 'QWERTY (A-S-D-F)',
  },
};

/** Short A-label for each text-size step, sized to preview the effect. */
const FONT_SCALE_LABELS: Record<number, string> = {
  1: 'A',
  1.15: 'A',
  1.3: 'A',
  1.5: 'A',
};

function describeKey(key: string): string {
  if (key === ' ') {
    return 'Space';
  }
  if (key.length === 1) {
    return key.toUpperCase();
  }
  return key;
}

/**
 * Per-device motor-accessibility settings (switch scanning & dwell). Self
 * contained: reads and writes localStorage via scanSettings.ts; the running
 * ScanProvider reacts live through the `scan-settings-changed` event.
 */
const AccessibilitySettings: FC = () => {
  const t = useTranslations();
  const rawLocale = useLocale();
  const locale = (
    rawLocale in UI_TRANSLATIONS ? rawLocale : 'en'
  ) as keyof typeof UI_TRANSLATIONS;
  const uiTrans = UI_TRANSLATIONS[locale];

  const [settings, setSettings] = useState<ScanSettings>(getScanSettings);
  const [uiSettings, setUiSettingsState] = useState<UiSettings>(getUiSettings);
  const [capturingKey, setCapturingKey] = useState(false);

  // localStorage is client-only: read the persisted value after mount.
  useEffect(() => {
    setSettings(getScanSettings());
    setUiSettingsState(getUiSettings());
  }, []);

  const update = useCallback((patch: Partial<ScanSettings>) => {
    setSettings(setScanSettings(patch));
  }, []);

  const updateUi = useCallback((patch: Partial<UiSettings>) => {
    setUiSettingsState(setUiSettings(patch));
  }, []);

  // Capture the next key press as the switch key.
  useEffect(() => {
    if (!capturingKey) {
      return undefined;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      update({ switchKey: event.key });
      setCapturingKey(false);
    };
    window.addEventListener('keydown', onKeyDown, { once: true });
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [capturingKey, update]);

  return (
    <div className='flex flex-col gap-3'>
      <div className='text-sm font-medium text-ink'>
        {t('settings.accessibility')}
      </div>

      {/* Mode selector */}
      <div className='flex flex-col gap-1'>
        <span className='text-xs text-muted'>{t('settings.accessMode')}</span>
        <div className='flex flex-wrap gap-2'>
          {MODES.map((mode) => (
            <button
              key={mode}
              type='button'
              onClick={() => update({ mode })}
              className={`px-4 py-2 text-sm rounded-2xl border transition-colors ${
                settings.mode === mode
                  ? 'bg-blue border-blue text-white'
                  : 'bg-surface border-hairline-2 text-ink-2 hover:bg-paper'
              }`}
            >
              {t(MODE_LABEL_KEY[mode])}
            </button>
          ))}
        </div>
      </div>

      {/* Auto-scan speed (auto/step modes) */}
      {(settings.mode === 'auto' || settings.mode === 'step') && (
        <div className='flex flex-col gap-1'>
          <div className='flex items-center justify-between'>
            <span className='text-xs text-muted'>
              {t('settings.scanInterval')}
            </span>
            <span className='text-sm text-ink tabular-nums'>
              {(settings.scanIntervalMs / 1000).toFixed(2)}s
            </span>
          </div>
          <input
            type='range'
            min={SCAN_INTERVAL_BOUNDS.min}
            max={SCAN_INTERVAL_BOUNDS.max}
            step={100}
            value={settings.scanIntervalMs}
            onChange={(e) =>
              update({ scanIntervalMs: parseInt(e.target.value, 10) })
            }
            className='w-full accent-green'
          />
        </div>
      )}

      {/* Dwell time */}
      {settings.mode === 'dwell' && (
        <div className='flex flex-col gap-1'>
          <div className='flex items-center justify-between'>
            <span className='text-xs text-muted'>
              {t('settings.dwellTime')}
            </span>
            <span className='text-sm text-ink tabular-nums'>
              {(settings.dwellMs / 1000).toFixed(2)}s
            </span>
          </div>
          <input
            type='range'
            min={DWELL_BOUNDS.min}
            max={DWELL_BOUNDS.max}
            step={100}
            value={settings.dwellMs}
            onChange={(e) => update({ dwellMs: parseInt(e.target.value, 10) })}
            className='w-full accent-green'
          />
        </div>
      )}

      {/* Switch key (auto/step modes) */}
      {(settings.mode === 'auto' || settings.mode === 'step') && (
        <div className='flex items-center justify-between gap-2'>
          <span className='text-xs text-muted'>{t('settings.switchKey')}</span>
          <button
            type='button'
            onClick={() => setCapturingKey(true)}
            className='px-4 py-2 text-sm text-ink-2 bg-surface border border-hairline-2 rounded-2xl hover:bg-paper min-w-24'
          >
            {capturingKey ? '…' : describeKey(settings.switchKey)}
          </button>
        </div>
      )}
      {(settings.mode === 'auto' || settings.mode === 'step') && (
        <p className='text-xs text-muted'>{t('settings.switchKeyHint')}</p>
      )}

      {/* Big targets toggle */}
      <label className='flex items-center justify-between gap-2 cursor-pointer'>
        <span className='text-xs text-muted'>{t('settings.bigTargets')}</span>
        <input
          type='checkbox'
          checked={settings.bigTargets}
          onChange={(e) => update({ bigTargets: e.target.checked })}
          className='size-5 accent-green'
        />
      </label>

      {/* Visual divider */}
      <div className='my-3 border-t border-hairline' />

      <div className='text-sm font-medium text-ink'>{uiTrans.uiSettings}</div>

      {/* Text size selector — scales the whole UI via the --fz multiplier. */}
      <div className='flex flex-col gap-1'>
        <span className='text-xs text-muted'>{uiTrans.textSize}</span>
        <div
          className='flex gap-2'
          role='group'
          aria-label={uiTrans.textSize}
        >
          {FONT_SCALE_STEPS.map((step, i) => (
            <button
              key={step}
              type='button'
              onClick={() => updateUi({ fontScale: step })}
              aria-pressed={uiSettings.fontScale === step}
              className={`min-h-11 min-w-11 px-3 flex items-center justify-center rounded-2xl border transition-colors ${
                uiSettings.fontScale === step
                  ? 'bg-blue border-blue text-white'
                  : 'bg-surface border-hairline-2 text-ink-2 hover:bg-paper'
              }`}
              style={{ fontSize: `${0.85 + i * 0.22}rem` }}
            >
              {FONT_SCALE_LABELS[step] ?? 'A'}
            </button>
          ))}
        </div>
      </div>

      {/* Theme selector */}
      <div className='flex flex-col gap-1'>
        <span className='text-xs text-muted'>{uiTrans.theme}</span>
        <div className='flex gap-2'>
          <button
            type='button'
            onClick={() => updateUi({ theme: 'light' })}
            className={`px-4 py-2 text-sm rounded-2xl border transition-colors ${
              uiSettings.theme === 'light'
                ? 'bg-blue border-blue text-white'
                : 'bg-surface border-hairline-2 text-ink-2 hover:bg-paper'
            }`}
          >
            {uiTrans.themeLight}
          </button>
          <button
            type='button'
            onClick={() => updateUi({ theme: 'dark' })}
            className={`px-4 py-2 text-sm rounded-2xl border transition-colors ${
              uiSettings.theme === 'dark'
                ? 'bg-blue border-blue text-white'
                : 'bg-surface border-hairline-2 text-ink-2 hover:bg-paper'
            }`}
          >
            {uiTrans.themeDark}
          </button>
        </div>
      </div>

      {/* Contrast selector */}
      <div className='flex flex-col gap-1'>
        <span className='text-xs text-muted'>{uiTrans.contrast}</span>
        <div className='flex gap-2'>
          <button
            type='button'
            onClick={() => updateUi({ contrast: 'normal' })}
            className={`px-4 py-2 text-sm rounded-2xl border transition-colors ${
              uiSettings.contrast === 'normal'
                ? 'bg-blue border-blue text-white'
                : 'bg-surface border-hairline-2 text-ink-2 hover:bg-paper'
            }`}
          >
            {uiTrans.contrastNormal}
          </button>
          <button
            type='button'
            onClick={() => updateUi({ contrast: 'high' })}
            className={`px-4 py-2 text-sm rounded-2xl border transition-colors ${
              uiSettings.contrast === 'high'
                ? 'bg-blue border-blue text-white'
                : 'bg-surface border-hairline-2 text-ink-2 hover:bg-paper'
            }`}
          >
            {uiTrans.contrastHigh}
          </button>
        </div>
      </div>

      {/* Keyboard Layout selector */}
      <div className='flex flex-col gap-1'>
        <span className='text-xs text-muted'>{uiTrans.keyboardLayout}</span>
        <div className='flex gap-2'>
          <button
            type='button'
            onClick={() => updateUi({ keyboardLayout: 'azerty' })}
            className={`px-4 py-2 text-sm rounded-2xl border transition-colors ${
              uiSettings.keyboardLayout === 'azerty'
                ? 'bg-blue border-blue text-white'
                : 'bg-surface border-hairline-2 text-ink-2 hover:bg-paper'
            }`}
          >
            {uiTrans.keyboardLayoutAzerty}
          </button>
          <button
            type='button'
            onClick={() => updateUi({ keyboardLayout: 'qwerty' })}
            className={`px-4 py-2 text-sm rounded-2xl border transition-colors ${
              uiSettings.keyboardLayout === 'qwerty'
                ? 'bg-blue border-blue text-white'
                : 'bg-surface border-hairline-2 text-ink-2 hover:bg-paper'
            }`}
          >
            {uiTrans.keyboardLayoutQwerty}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AccessibilitySettings;
