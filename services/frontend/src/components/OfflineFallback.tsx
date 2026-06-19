'use client';

import { RefreshCw, Volume2 } from 'lucide-react';
import { FC, useCallback, useMemo, useState } from 'react';
import CouldNotConnect, { HealthStatus } from '@/components/CouldNotConnect';
import EmergencyButton from '@/components/EmergencyButton';
import QuickPhrases from '@/components/QuickPhrases';
import { useTranslations } from '@/i18n';
import { loadSettingsSnapshot } from '@/utils/localSettingsCache';
import { playQuickPhrase } from '@/utils/phraseAudio';

interface OfflineFallbackProps {
  healthStatus: HealthStatus;
  onRetry: () => void;
}

/**
 * Degraded communication mode shown when the backend is unreachable. The
 * user can still speak: quick phrases play from their persisted audio
 * (cloned voice), and free text falls back to browser speech synthesis.
 */
const OfflineFallback: FC<OfflineFallbackProps> = ({
  healthStatus,
  onRetry,
}) => {
  const t = useTranslations();
  const [textInput, setTextInput] = useState('');
  const snapshot = useMemo(() => loadSettingsSnapshot(), []);

  const speak = useCallback(
    (text: string) => {
      if (!text.trim()) {
        return;
      }
      playQuickPhrase({
        text: text.trim(),
        voiceName: snapshot?.voice,
        lang: snapshot?.expected_transcription_language ?? undefined,
      }).catch(console.error);
    },
    [snapshot],
  );

  const speakTextInput = useCallback(() => {
    speak(textInput);
  }, [speak, textInput]);

  return (
    <div className='w-full min-h-screen flex flex-col items-center gap-6 px-4 py-10 overflow-y-auto text-ink'>
      <div className='w-full max-w-2xl flex flex-col gap-4'>
        <h1 className='text-2xl font-bold text-center'>
          {t('connection.fallbackTitle')}
        </h1>
        <p className='text-sm text-ink-2 text-center'>
          {t('connection.fallbackHelp')}
        </p>

        <EmergencyButton className='self-center' />

        <QuickPhrases
          phrases={snapshot?.quick_phrases ?? []}
          onSelect={speak}
        />

        <div className='w-full px-6 py-4 bg-surface border border-hairline shadow-[var(--sh-sm)] rounded-[40px] flex flex-col gap-2'>
          <textarea
            className='w-full px-6 py-4 text-base text-ink bg-surface-2 border border-hairline-2 rounded-3xl resize-none focus:outline-none focus:border-blue'
            placeholder={t('connection.fallbackInputPlaceholder')}
            rows={2}
            value={textInput}
            onChange={(event) => setTextInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                speakTextInput();
              }
            }}
          />
          <button
            onClick={speakTextInput}
            disabled={!textInput.trim()}
            className='self-end h-14 bg-blue hover:bg-blue-600 transition-colors rounded-2xl w-fit disabled:opacity-50 flex flex-row items-center justify-center gap-3 px-8 text-white'
          >
            {t('connection.speak')}
            <Volume2
              width={24}
              height={24}
            />
          </button>
        </div>

        <button
          onClick={onRetry}
          className='self-center mt-2 px-6 py-3 flex flex-row items-center gap-2 text-sm text-ink-2 bg-surface border border-hairline-2 rounded-2xl hover:bg-paper'
        >
          <RefreshCw
            width={16}
            height={16}
          />
          {t('connection.retry')}
        </button>
      </div>

      <div className='w-full max-w-2xl'>
        <CouldNotConnect healthStatus={healthStatus} />
      </div>
    </div>
  );
};

export default OfflineFallback;
