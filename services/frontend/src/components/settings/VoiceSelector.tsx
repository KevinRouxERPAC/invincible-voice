import { LoaderCircleIcon, Play, XCircle } from 'lucide-react';
import { FC } from 'react';
import { useTranslations } from '@/i18n';

interface VoiceSelectorProps {
  selectedVoice: string | null;
  availableVoices: Record<string, string> | null;
  isLoadingVoices: boolean;
  isPlayingVoice: boolean;
  onVoiceChange: (value: string) => void;
  onTestVoice: () => void;
  onDeleteVoice: () => void;
  showDeleteButton?: boolean;
}

const VoiceSelector: FC<VoiceSelectorProps> = ({
  selectedVoice,
  availableVoices,
  isLoadingVoices,
  isPlayingVoice,
  onVoiceChange,
  onTestVoice,
  onDeleteVoice,
  showDeleteButton = false,
}) => {
  const t = useTranslations();

  return (
    <div className='flex gap-2'>
      <select
        value={selectedVoice || ''}
        onChange={(e) => onVoiceChange(e.target.value)}
        disabled={isLoadingVoices}
        className='flex-1 px-4 py-3 text-base text-ink bg-surface-2 border border-hairline-2 rounded-2xl focus:outline-none focus:border-blue disabled:opacity-50'
      >
        <option value=''>{t('common.default')}</option>

        {availableVoices &&
          Object.entries(availableVoices)
            .sort(([, langA], [, langB]) => langA.localeCompare(langB))
            .map(([voiceName, language]) => (
              <option
                key={voiceName}
                value={voiceName}
              >
                {voiceName.includes('/')
                  ? voiceName.substring(voiceName.indexOf('/') + 1)
                  : voiceName}
                ({language})
              </option>
            ))}
      </select>

      <button
        type='button'
        onClick={onTestVoice}
        disabled={!selectedVoice || isPlayingVoice}
        className='px-4 py-2 text-sm text-ink bg-surface-2 border border-hairline-2 rounded-2xl focus:outline-none focus:border-blue hover:bg-paper disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 whitespace-nowrap'
      >
        {isPlayingVoice ? (
          <LoaderCircleIcon
            size={16}
            className='animate-spin'
          />
        ) : (
          <Play size={16} />
        )}
        {t('settings.testYourVoice')}
      </button>

      {showDeleteButton && (
        <button
          type='button'
          onClick={onDeleteVoice}
          className='px-3 py-2 text-ink-2 bg-surface-2 border border-hairline-2 rounded-2xl focus:outline-none focus:border-red hover:bg-paper hover:border-red'
          title={t('common.delete')}
        >
          <XCircle
            size={16}
            className='text-red'
          />
        </button>
      )}
    </div>
  );
};

export default VoiceSelector;
