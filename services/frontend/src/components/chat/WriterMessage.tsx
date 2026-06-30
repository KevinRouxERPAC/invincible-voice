'use client';

import { FC, Fragment, useEffect, useState } from 'react';
import { useTranslations } from '@/i18n';

interface WriterMessageProps {
  content: string;
  onClick?: () => void;
  isClickable?: boolean;
  messageId?: string;
}

const WriterMessage: FC<WriterMessageProps> = ({
  content,
  onClick = undefined,
  isClickable = false,
  messageId = undefined,
}) => {
  const t = useTranslations();
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    if (messageId) {
      const handlePlaybackState = (event: Event) => {
        const customEvent = event as CustomEvent<{
          messageId: string;
          isPlaying: boolean;
        }>;
        if (customEvent.detail && customEvent.detail.messageId === messageId) {
          setIsPlaying(customEvent.detail.isPlaying);
        }
      };

      window.addEventListener('tts-playback-state', handlePlaybackState);
      return () => {
        window.removeEventListener('tts-playback-state', handlePlaybackState);
      };
    }
    return undefined;
  }, [messageId]);

  const renderWaveform = () => {
    if (!isPlaying) return null;

    return (
      <span
        className='flex items-end gap-1 h-5 shrink-0 ml-3'
        aria-hidden='true'
      >
        <span
          className='w-1 bg-white rounded-full h-4 animate-wave-bar'
          style={{ animationDelay: '0.1s' }}
        />
        <span
          className='w-1 bg-white rounded-full h-5 animate-wave-bar'
          style={{ animationDelay: '0.3s' }}
        />
        <span
          className='w-1 bg-white rounded-full h-3 animate-wave-bar'
          style={{ animationDelay: '0.5s' }}
        />
        <span
          className='w-1 bg-white rounded-full h-4 animate-wave-bar'
          style={{ animationDelay: '0.2s' }}
        />
      </span>
    );
  };

  return (
    <Fragment>
      {isClickable && content.trim() && (
        <button
          className='flex self-end items-center justify-end max-w-[70%] w-auto bg-blue border-blue px-6 py-3 rounded-b-3xl rounded-tl-3xl rounded-tr-sm text-base font-medium text-white leading-relaxed whitespace-pre-wrap cursor-pointer hover:bg-blue-600 transition-colors text-right'
          onClick={onClick}
          title={t('conversation.clickToPlayAudio')}
        >
          <span className='grow'>{content}</span>
          {renderWaveform()}
        </button>
      )}
      {!isClickable && content.trim() && (
        <div className='flex self-end items-center justify-end max-w-[70%] w-auto bg-blue border-blue px-6 py-3 rounded-b-3xl rounded-tl-3xl rounded-tr-sm text-base font-medium text-white leading-relaxed whitespace-pre-wrap text-right'>
          <span className='grow'>{content}</span>
          {renderWaveform()}
        </div>
      )}
    </Fragment>
  );
};

export default WriterMessage;
