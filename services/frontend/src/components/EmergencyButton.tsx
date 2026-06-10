'use client';

import { Siren } from 'lucide-react';
import { FC, useCallback } from 'react';
import { useTranslations } from '@/i18n';
import { cn } from '@/utils/cn';
import { loadSettingsSnapshot } from '@/utils/localSettingsCache';
import { playQuickPhrase } from '@/utils/phraseAudio';

interface EmergencyButtonProps {
  className?: string;
  /** Icon-only variant for tight spots like the mobile header */
  compact?: boolean;
}

/**
 * Speaks a call for help immediately: no STT, no LLM, no waiting. Uses the
 * persisted cloned-voice audio when available and falls back to browser
 * speech synthesis, so it works even when the backend is unreachable.
 */
const EmergencyButton: FC<EmergencyButtonProps> = ({
  className = '',
  compact = false,
}) => {
  const t = useTranslations();

  const onClick = useCallback(() => {
    const snapshot = loadSettingsSnapshot();
    playQuickPhrase({
      text: t('conversation.emergencyPhrase'),
      voiceName: snapshot?.voice,
      lang: snapshot?.expected_transcription_language ?? undefined,
    }).catch(console.error);
  }, [t]);

  return (
    <button
      onClick={onClick}
      aria-label={t('conversation.emergencyButton')}
      title={t('conversation.emergencyButton')}
      className={cn(
        'shrink-0 flex flex-row items-center justify-center gap-2 font-bold text-white bg-[#C2362B] hover:bg-[#E0554E] rounded-2xl focus:outline-none focus:ring-2 focus:ring-red-400 transition-colors',
        compact ? 'h-11 px-3' : 'h-12 px-5',
        className,
      )}
    >
      <Siren
        width={compact ? 20 : 24}
        height={compact ? 20 : 24}
        className='shrink-0'
      />
      {!compact && t('conversation.emergencyButton')}
    </button>
  );
};

export default EmergencyButton;
