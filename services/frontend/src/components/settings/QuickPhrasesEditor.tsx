'use client';

import { Plus } from 'lucide-react';
import { useCallback, useState, type FC, type KeyboardEvent } from 'react';
import { useTranslations } from '@/i18n';
import type { QuickPhrase } from '@/utils/userData';

interface QuickPhrasesEditorProps {
  phrases: QuickPhrase[];
  onChange: (phrases: QuickPhrase[]) => void;
}

const QuickPhrasesEditor: FC<QuickPhrasesEditorProps> = ({
  phrases,
  onChange,
}) => {
  const t = useTranslations();
  const [newPhraseInput, setNewPhraseInput] = useState('');
  const [newPhraseCategoryInput, setNewPhraseCategoryInput] = useState('');

  const handleAddPhrase = useCallback(() => {
    const text = newPhraseInput.trim();
    if (!text || phrases.some((phrase) => phrase.text === text)) {
      return;
    }
    onChange([...phrases, { text, category: newPhraseCategoryInput.trim() }]);
    setNewPhraseInput('');
  }, [newPhraseInput, newPhraseCategoryInput, onChange, phrases]);

  const handleRemovePhrase = useCallback(
    (phraseToRemove: QuickPhrase) => {
      onChange(phrases.filter((phrase) => phrase.text !== phraseToRemove.text));
    },
    [onChange, phrases],
  );

  const handlePhraseInputKeyPress = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        handleAddPhrase();
      }
    },
    [handleAddPhrase],
  );

  return (
    <div className='w-full px-4 py-4 bg-surface border border-hairline shadow-[var(--sh-sm)] rounded-3xl flex flex-col gap-3'>
      <div>
        <div className='text-sm font-medium text-ink'>
          {t('settings.quickPhrases')}
        </div>
        <p className='text-xs text-muted mt-1'>
          {t('settings.quickPhrasesHelp')}
        </p>
      </div>
      <div className='flex flex-wrap gap-1.5 min-h-6 max-h-40 overflow-y-auto overflow-x-hidden py-1'>
        {phrases.map((phrase) => (
          <div
            key={phrase.text}
            className='relative group'
          >
            <div className='h-10 bg-blue-tint border border-blue-tint-2 rounded-2xl px-3 flex items-center text-sm text-blue-600 font-medium'>
              {phrase.text}
              {phrase.category ? (
                <span className='ml-2 text-[10px] text-muted'>
                  {phrase.category}
                </span>
              ) : null}
            </div>
            <button
              type='button'
              onClick={() => handleRemovePhrase(phrase)}
              className='absolute flex items-center justify-center leading-none size-6 text-base text-white bg-red rounded-full -top-2 -right-2 hover:bg-[#a73d2f] focus:outline-none focus:ring-2 focus:ring-red transition-colors'
              title={t('common.delete')}
            >
              ×
            </button>
          </div>
        ))}
        {phrases.length === 0 && (
          <p className='text-sm italic text-muted'>
            {t('settings.noPhrasesAdded')}
          </p>
        )}
      </div>
      <div className='flex flex-col gap-2 sm:flex-row'>
        <input
          type='text'
          value={newPhraseInput}
          onChange={(event) => setNewPhraseInput(event.target.value)}
          onKeyDown={handlePhraseInputKeyPress}
          className='flex-1 px-4 py-3 text-sm text-ink bg-surface-2 border border-hairline-2 rounded-2xl focus:outline-none focus:border-blue min-h-11'
          placeholder={t('settings.addPhrasePlaceholder')}
        />
        <input
          type='text'
          value={newPhraseCategoryInput}
          onChange={(event) => setNewPhraseCategoryInput(event.target.value)}
          onKeyDown={handlePhraseInputKeyPress}
          className='w-full sm:w-32 px-4 py-3 text-sm text-ink bg-surface-2 border border-hairline-2 rounded-2xl focus:outline-none focus:border-blue min-h-11'
          placeholder={t('settings.phraseCategoryPlaceholder')}
        />
        <button
          type='button'
          onClick={handleAddPhrase}
          className='shrink-0 h-11 px-4 bg-blue hover:bg-blue-600 transition-colors rounded-2xl text-sm text-white font-medium inline-flex items-center justify-center gap-2'
        >
          {t('common.add')}
          <Plus
            width={18}
            height={18}
            className='shrink-0 text-white'
          />
        </button>
      </div>
    </div>
  );
};

export default QuickPhrasesEditor;
