'use client';

import { FC, Fragment, useMemo } from 'react';
import { useTranslations } from '@/i18n';
import { groupPhrasesByCategory } from '@/utils/phraseAudio';
import { QuickPhrase } from '@/utils/userData';

interface QuickPhrasesProps {
  phrases: QuickPhrase[];
  onSelect: (text: string) => void;
  /** Compact horizontal strip (mobile) instead of the full panel */
  compact?: boolean;
}

/**
 * The user's personal phrase bank: one tap speaks the phrase instantly,
 * without waiting for the STT/LLM loop.
 */
const QuickPhrases: FC<QuickPhrasesProps> = ({
  phrases,
  onSelect,
  compact = false,
}) => {
  const t = useTranslations();
  const groups = useMemo(() => groupPhrasesByCategory(phrases), [phrases]);

  if (phrases.length === 0) {
    return null;
  }

  if (compact) {
    return (
      <div
        className='flex gap-2 overflow-x-auto no-scrollbar'
        aria-label={t('conversation.quickPhrases')}
      >
        {phrases.map((phrase) => (
          <button
            key={`${phrase.category}|${phrase.text}`}
            data-scan-item
            className='shrink-0 px-3 min-h-[32px] bg-blue-tint border border-blue-tint-2 rounded-full text-xs text-blue-600 hover:bg-blue-tint-2 transition-colors max-w-[64vw] truncate'
            onClick={() => onSelect(phrase.text)}
            title={phrase.text}
          >
            {phrase.text}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className='w-full px-6 py-4 bg-surface border border-hairline shadow-[var(--sh-sm)] rounded-[40px]'>
      <div className='mb-1 text-sm font-medium text-ink'>
        {t('conversation.quickPhrases')}
      </div>
      <div className='flex flex-col gap-1 max-h-44 overflow-y-auto overflow-x-hidden py-2 px-0.5'>
        {Array.from(groups.entries()).map(([category, groupPhrases]) => (
          <Fragment key={category || 'uncategorized'}>
            {category && (
              <div className='mt-1 text-xs font-medium text-muted'>
                {category}
              </div>
            )}
            <div className='flex flex-wrap gap-1.5'>
              {groupPhrases.map((phrase) => (
                <button
                  key={phrase.text}
                  data-scan-item
                  className='h-10 transition-colors cursor-pointer bg-blue-tint border border-blue-tint-2 hover:bg-blue-tint-2 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500'
                  onClick={() => onSelect(phrase.text)}
                >
                  <div className='flex flex-col justify-center px-3 h-full text-sm text-blue-600 font-medium rounded-2xl'>
                    {phrase.text}
                  </div>
                </button>
              ))}
            </div>
          </Fragment>
        ))}
      </div>
    </div>
  );
};

export default QuickPhrases;
