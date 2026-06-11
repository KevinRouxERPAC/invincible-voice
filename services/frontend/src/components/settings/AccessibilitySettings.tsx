'use client';

import { FC, useCallback, useEffect, useState } from 'react';
import { useTranslations } from '@/i18n';
import {
  DWELL_BOUNDS,
  getScanSettings,
  SCAN_INTERVAL_BOUNDS,
  ScanMode,
  setScanSettings,
  ScanSettings,
} from '@/utils/scanSettings';

const MODES: ScanMode[] = ['off', 'auto', 'step', 'dwell'];
const MODE_LABEL_KEY: Record<ScanMode, string> = {
  off: 'settings.accessModeOff',
  auto: 'settings.accessModeAuto',
  step: 'settings.accessModeStep',
  dwell: 'settings.accessModeDwell',
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
  const [settings, setSettings] = useState<ScanSettings>(getScanSettings);
  const [capturingKey, setCapturingKey] = useState(false);

  // localStorage is client-only: read the persisted value after mount.
  useEffect(() => {
    setSettings(getScanSettings());
  }, []);

  const update = useCallback((patch: Partial<ScanSettings>) => {
    setSettings(setScanSettings(patch));
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
      <div className='text-sm font-medium text-white'>
        {t('settings.accessibility')}
      </div>

      {/* Mode selector */}
      <div className='flex flex-col gap-1'>
        <span className='text-xs text-white/60'>
          {t('settings.accessMode')}
        </span>
        <div className='flex flex-wrap gap-2'>
          {MODES.map((mode) => (
            <button
              key={mode}
              type='button'
              onClick={() => update({ mode })}
              className={`px-4 py-2 text-sm rounded-2xl border transition-colors ${
                settings.mode === mode
                  ? 'bg-[#101010] border-green text-white'
                  : 'bg-[#1B1B1B] border-white/40 text-white/70 hover:bg-[#2B2B2B]'
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
            <span className='text-xs text-white/60'>
              {t('settings.scanInterval')}
            </span>
            <span className='text-sm text-white tabular-nums'>
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
            <span className='text-xs text-white/60'>
              {t('settings.dwellTime')}
            </span>
            <span className='text-sm text-white tabular-nums'>
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
          <span className='text-xs text-white/60'>
            {t('settings.switchKey')}
          </span>
          <button
            type='button'
            onClick={() => setCapturingKey(true)}
            className='px-4 py-2 text-sm text-white bg-[#1B1B1B] border border-white rounded-2xl hover:bg-[#2B2B2B] min-w-24'
          >
            {capturingKey ? '…' : describeKey(settings.switchKey)}
          </button>
        </div>
      )}
      {(settings.mode === 'auto' || settings.mode === 'step') && (
        <p className='text-xs text-white/60'>{t('settings.switchKeyHint')}</p>
      )}

      {/* Big targets toggle */}
      <label className='flex items-center justify-between gap-2 cursor-pointer'>
        <span className='text-xs text-white/60'>
          {t('settings.bigTargets')}
        </span>
        <input
          type='checkbox'
          checked={settings.bigTargets}
          onChange={(e) => update({ bigTargets: e.target.checked })}
          className='size-5 accent-green'
        />
      </label>
    </div>
  );
};

export default AccessibilitySettings;
