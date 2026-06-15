'use client';

import { FC } from 'react';

interface SpeakerMessageProps {
  content: string;
  showTypingIndicator?: boolean;
}

const SpeakerMessage: FC<SpeakerMessageProps> = ({
  content,
  showTypingIndicator = false,
}) => {
  if (!content.trim()) {
    return null;
  }

  return (
    <div className='max-w-[70%] w-auto bg-surface border border-hairline shadow-[var(--sh-sm)] px-6 py-3 rounded-b-3xl rounded-tr-3xl rounded-tl-sm text-base font-medium text-ink leading-relaxed whitespace-pre-wrap'>
      {content}
      {showTypingIndicator && (
        <span className='inline-block w-1 h-4 ml-1 bg-sage animate-pulse' />
      )}
    </div>
  );
};

export default SpeakerMessage;
