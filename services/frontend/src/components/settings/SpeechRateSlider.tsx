'use client';

import { FC, useCallback, useEffect, useState } from 'react';
import { useTranslations } from '@/i18n';
import {
  getSpeechRate,
  setSpeechRate,
  MIN_SPEECH_RATE,
  MAX_SPEECH_RATE,
} from '@/utils/speechRate';

// The rate is persisted in localStorage (per device) and read by the TTS
// player (see ttsUtil.ts), so changes apply immediately without saving the
// account settings.
const SpeechRateSlider: FC = () => {
  const t = useTranslations();
  const [speechRate, setSpeechRateState] = useState<number>(1);

  // Load the persisted speech rate once on mount (localStorage is client-only).
  useEffect(() => {
    setSpeechRateState(getSpeechRate());
  }, []);

  const handleSpeechRateChange = useCallback((value: number) => {
    setSpeechRateState(value);
    setSpeechRate(value);
  }, []);

  return (
    <div className='flex flex-col gap-1'>
      <div className='flex items-center justify-between'>
        <label
          htmlFor='speech-rate'
          className='text-sm font-medium text-ink'
        >
          {t('settings.speechRate')}
        </label>
        <span className='text-sm text-ink tabular-nums'>
          {Math.round(speechRate * 100)}%
        </span>
      </div>
      <input
        id='speech-rate'
        type='range'
        min={MIN_SPEECH_RATE}
        max={MAX_SPEECH_RATE}
        step={0.05}
        value={speechRate}
        onChange={(e) => handleSpeechRateChange(parseFloat(e.target.value))}
        className='w-full accent-green'
      />
      <p className='text-xs text-muted'>{t('settings.speechRateHint')}</p>
    </div>
  );
};

export default SpeechRateSlider;
