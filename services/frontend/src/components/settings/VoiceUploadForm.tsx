import { LoaderCircleIcon } from 'lucide-react';
import { FC, ChangeEvent } from 'react';
import { useTranslations } from '@/i18n';

interface VoiceUploadFormProps {
  voiceName: string;
  onVoiceNameChange: (value: string) => void;
  onFileChange: (file: File | null) => void;
  onCreateVoice: () => void;
  onCancel: () => void;
  isCreating: boolean;
  error: string | null;
}

const VoiceUploadForm: FC<VoiceUploadFormProps> = ({
  voiceName,
  onVoiceNameChange,
  onFileChange,
  onCreateVoice,
  onCancel,
  isCreating,
  error,
}) => {
  const t = useTranslations();

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    if (file) {
      const validExtensions = ['.mp3', '.wav'];
      const fileName = file.name.toLowerCase();
      if (!validExtensions.some((ext) => fileName.endsWith(ext))) {
        onFileChange(null);
        // Error will be set by parent
        return;
      }
      onFileChange(file);
    }
  };

  return (
    <div className='mt-2 px-4 py-3 bg-surface-2 border border-hairline rounded-2xl'>
      <div className='flex flex-col gap-3'>
        <div className='flex flex-col gap-1'>
          <label
            htmlFor='voice-upload-name-input'
            className='text-xs font-medium text-ink-2'
          >
            {t('settings.voiceName')}
          </label>

          <input
            id='voice-upload-name-input'
            type='text'
            value={voiceName}
            onChange={(e) => onVoiceNameChange(e.target.value)}
            className='w-full px-3 py-2 text-sm text-ink bg-surface-2 border border-hairline-2 rounded-xl focus:outline-none focus:border-blue'
            placeholder={t('settings.voiceNamePlaceholder')}
          />
        </div>

        <div className='flex flex-col gap-1'>
          <label
            htmlFor='voice-upload-file-input'
            className='text-xs font-medium text-ink-2'
          >
            {t('settings.audioFile')}
          </label>

          <input
            id='voice-upload-file-input'
            type='file'
            accept='.mp3,.wav'
            onChange={handleFileChange}
            className='w-full px-3 py-2 text-sm text-ink bg-surface-2 border border-hairline-2 rounded-xl focus:outline-none focus:border-blue file:mr-4 file:py-1 file:px-4 file:rounded-lg file:border-0 file:bg-sage file:text-white file:text-sm file:cursor-pointer'
          />
        </div>

        {error && <p className='text-xs text-red'>{error}</p>}

        <div className='flex gap-2'>
          <button
            type='button'
            onClick={onCancel}
            className='flex-1 px-4 py-2 text-sm text-ink bg-surface-2 border border-hairline-2 rounded-xl focus:outline-none focus:border-blue hover:bg-paper'
          >
            {t('common.cancel')}
          </button>

          <button
            type='button'
            onClick={onCreateVoice}
            disabled={isCreating}
            className='flex-1 px-4 py-2 text-sm text-white bg-sage rounded-xl focus:outline-none hover:bg-sage-600 disabled:opacity-50 disabled:cursor-not-allowed'
          >
            {isCreating ? (
              <LoaderCircleIcon
                size={16}
                className='animate-spin mx-auto'
              />
            ) : (
              t('settings.createVoice')
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default VoiceUploadForm;
