'use client';

import { FC, Fragment } from 'react';
import { useTranslations } from '@/i18n';

interface WriterMessageProps {
  content: string;
  onClick?: () => void;
  isClickable?: boolean;
}

const WriterMessage: FC<WriterMessageProps> = ({
  content,
  onClick = undefined,
  isClickable = false,
}) => {
  const t = useTranslations();

  return (
    <Fragment>
      {isClickable && content.trim() && (
        <button
          className='flex self-end max-w-[70%] w-auto bg-blue border border-blue px-6 py-3 rounded-b-3xl rounded-tl-3xl rounded-tr-sm text-base font-medium text-white leading-relaxed whitespace-pre-wrap cursor-pointer hover:bg-blue-600 transition-colors text-right'
          onClick={onClick}
          title={t('conversation.clickToPlayAudio')}
        >
          {content}
        </button>
      )}
      {!isClickable && content.trim() && (
        <div className='flex self-end max-w-[70%] w-auto bg-blue border border-blue px-6 py-3 rounded-b-3xl rounded-tl-3xl rounded-tr-sm text-base font-medium text-white leading-relaxed whitespace-pre-wrap text-right'>
          {content}
        </div>
      )}
    </Fragment>
  );
};

export default WriterMessage;
