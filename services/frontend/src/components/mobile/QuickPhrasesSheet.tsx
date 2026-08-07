'use client';

import { X } from 'lucide-react';
import { FC } from 'react';
import { useTranslations } from '@/i18n';
import { QuickPhrase } from '@/utils/userData';

interface QuickPhrasesSheetProps {
  phrases: QuickPhrase[];
  onSelect: (text: string) => void;
  onClose: () => void;
  onEdit?: () => void;
}

/**
 * Full-screen quick-phrases picker (wireframe 2b). One tap speaks instantly.
 */
const QuickPhrasesSheet: FC<QuickPhrasesSheetProps> = ({
  phrases,
  onSelect,
  onClose,
  onEdit = undefined,
}) => {
  const t = useTranslations();

  const handleSelect = (text: string) => {
    onSelect(text);
    onClose();
  };

  return (
    <div className='fixed inset-0 z-50 flex flex-col bg-paper text-ink'>
      <div style={{ height: 'var(--safe-area-inset-top)' }} />
      <div className='flex items-center gap-2 px-3 py-2.5 border-b border-hairline shrink-0'>
        <h2 className='flex-1 text-base font-bold text-ink'>
          {t('conversation.quickPhrases')}
        </h2>
        <button
          data-scan-item
          className='shrink-0 size-11 flex items-center justify-center bg-surface border border-hairline-2 rounded-[11px] text-ink-2'
          onClick={onClose}
          aria-label={t('conversation.closeAriaLabel')}
        >
          <X size={20} />
        </button>
      </div>
      <div className='flex-1 min-h-0 overflow-y-auto overscroll-contain p-3 grid grid-cols-2 gap-2.5 auto-rows-fr content-start'>
        {phrases.map((phrase) => (
          <button
            key={`${phrase.category}|${phrase.text}`}
            data-scan-item
            className='min-h-[52px] flex items-center justify-center px-2 py-1.5 text-[15px] font-bold text-ink-2 bg-surface border-2 border-hairline-2 rounded-[14px] text-center wrap-break-word'
            onClick={() => handleSelect(phrase.text)}
          >
            {phrase.text}
          </button>
        ))}
        {onEdit && (
          <button
            data-scan-item
            className='min-h-[52px] flex items-center justify-center px-2 py-1.5 text-[15px] font-bold text-muted bg-surface border-2 border-dashed border-hairline-2 rounded-[14px]'
            onClick={onEdit}
          >
            {t('conversation.addQuickPhrase')}
          </button>
        )}
      </div>
      <div style={{ height: 'var(--safe-area-inset-bottom)' }} />
    </div>
  );
};

export default QuickPhrasesSheet;
