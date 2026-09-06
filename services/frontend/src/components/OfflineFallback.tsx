import { RefreshCw, Volume2, WifiOff } from 'lucide-react';
import { FC, useCallback, useMemo, useState } from 'react';
import EmergencyButton from '@/components/EmergencyButton';
import QuickPhrases from '@/components/QuickPhrases';
import { useTranslations } from '@/i18n';
import type { HealthStatus } from '@/types/health';
import { loadSettingsSnapshot } from '@/utils/localSettingsCache';
import { playQuickPhrase } from '@/utils/phraseAudio';

interface OfflineFallbackProps {
  healthStatus: HealthStatus;
  onRetry: () => void;
}

/**
 * Offline survival screen, shown when the backend is unreachable after all
 * startup retries. Designed for a first-time user: a clear "why am I here"
 * banner, the three communication paths that still work (emergency, quick
 * phrases with cached voice, free text with the device voice), and an honest
 * note about what is unavailable (smart suggestions need the server).
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

  const isServerDown =
    healthStatus.internet_up !== false && healthStatus.backend_up === false;

  return (
    <div className='w-full min-h-screen flex flex-col items-center px-4 py-8 overflow-y-auto text-ink bg-paper gap-6'>
      <div className='w-full max-w-2xl flex flex-col gap-5'>
        {/* Header: why am I here */}
        <div className='flex flex-col items-center gap-2 text-center'>
          <div
            className='w-16 h-16 rounded-full bg-terra-tint flex items-center justify-center'
            aria-hidden='true'
          >
            <WifiOff
              width={30}
              height={30}
              className='text-terra'
            />
          </div>
          <h1 className='text-2xl font-bold'>
            {t('connection.fallbackTitle')}
          </h1>
          <p className='text-sm text-ink-2 max-w-md'>
            {t('connection.fallbackHelp')}
          </p>
          {isServerDown && (
            <p className='text-xs text-muted mt-1'>
              {t('connection.serverAsleepHint')}
            </p>
          )}
        </div>

        {/* Emergency: always first, biggest control */}
        <EmergencyButton
          className='self-center'
          labeled
        />

        {/* Quick phrases with cached cloned-voice audio */}
        <section className='w-full px-6 py-4 bg-surface border border-hairline shadow-[var(--sh-sm)] rounded-[40px] flex flex-col gap-3'>
          <h2 className='text-sm font-medium text-ink'>
            {t('connection.fallbackQuickPhrases')}
          </h2>
          <QuickPhrases
            phrases={snapshot?.quick_phrases ?? []}
            onSelect={speak}
          />
        </section>

        {/* Free text via the device's own voice */}
        <section className='w-full px-6 py-4 bg-surface border border-hairline shadow-[var(--sh-sm)] rounded-[40px] flex flex-col gap-2'>
          <h2 className='text-sm font-medium text-ink'>
            {t('connection.fallbackFreeText')}
          </h2>
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
        </section>

        {/* What does NOT work offline — honest expectation setting */}
        <p className='text-xs text-muted text-center px-4'>
          {t('connection.fallbackUnavailable')}
        </p>

        {/* Retry */}
        <button
          onClick={onRetry}
          className='self-center px-6 py-3 flex flex-row items-center gap-2 text-sm text-ink-2 bg-surface border border-hairline-2 rounded-2xl hover:bg-paper'
        >
          <RefreshCw
            width={16}
            height={16}
          />
          {t('connection.retry')}
        </button>
      </div>
    </div>
  );
};

export default OfflineFallback;
