'use client';

import { Siren } from 'lucide-react';
import { FC, Fragment, useCallback } from 'react';
import { useTranslations } from '@/i18n';
import { cn } from '@/utils/cn';
import { triggerHapticError } from '@/utils/haptics';
import { loadSettingsSnapshot } from '@/utils/localSettingsCache';
import { playQuickPhrase } from '@/utils/phraseAudio';

interface EmergencyButtonProps {
  className?: string;
  /** Icon-only variant for tight spots like the mobile header */
  compact?: boolean;
  /** Large labelled button for the home screen (wireframe 2a) */
  labeled?: boolean;
}

/**
 * Speaks a call for help immediately: no STT, no LLM, no waiting. Uses the
 * persisted cloned-voice audio when available and falls back to browser
 * speech synthesis, so it works even when the backend is unreachable.
 */
const EmergencyButton: FC<EmergencyButtonProps> = ({
  className = '',
  compact = false,
  labeled = false,
}) => {
  const t = useTranslations();

  const onClick = useCallback(() => {
    triggerHapticError();
    const snapshot = loadSettingsSnapshot();
    playQuickPhrase({
      text: t('conversation.emergencyPhrase'),
      voiceName: snapshot?.voice,
      lang: snapshot?.expected_transcription_language ?? undefined,
      preferLocal: true, // Force local for emergency
      pitch: 0.8, // Slightly deeper for authority/masculine tone
      rate: 1.1, // Slightly faster for urgency
    }).catch(console.error);
  }, [t]);

  const renderButtonContent = () => {
    if (labeled) {
      return (
        <Fragment>
          <Siren
            width={18}
            height={18}
            className='shrink-0'
          />
          <span className='uppercase tracking-wide'>
            {t('conversation.emergencyLabel')}
          </span>
        </Fragment>
      );
    }
    if (compact) {
      // Icon-only: the fixed-size square header slot cannot fit the label text
      // without overflowing onto the neighbouring controls. The button keeps
      // its aria-label/title so it stays accessible.
      return (
        <Siren
          width={22}
          height={22}
          className='shrink-0'
        />
      );
    }
    return (
      <Fragment>
        <Siren
          width={24}
          height={24}
          className='shrink-0'
        />
        {t('conversation.emergencyButton')}
      </Fragment>
    );
  };

  return (
    <button
      onClick={onClick}
      data-scan-item
      data-scan-order={-1}
      aria-label={t('conversation.emergencyButton')}
      title={t('conversation.emergencyButton')}
      className={cn(
        'shrink-0 flex flex-row items-center justify-center gap-1.5 font-bold rounded-2xl focus:outline-none focus:ring-2 focus:ring-red transition-colors text-white bg-red border-2 border-red hover:bg-[#a73d2f]',
        labeled && 'h-12 px-4 text-sm border-[2.5px]',
        compact && !labeled && 'size-11 text-xs',
        !compact && !labeled && 'h-12 px-5',
        className,
      )}
    >
      {renderButtonContent()}
    </button>
  );
};

export default EmergencyButton;
