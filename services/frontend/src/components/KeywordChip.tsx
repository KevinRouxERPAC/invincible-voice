'use client';

import { FC, useState } from 'react';

interface KeywordChipProps {
  word: string;
  onWordClick: (word: string) => void;
  onIntentClick: (word: string, intent: string) => void;
}

// Glyph + backend intent + accessible label. Kept here so the chip stays the
// single source of truth for the keyword intent actions.
const INTENTS: { glyph: string; intent: string; label: string }[] = [
  { glyph: '?', intent: 'poser une question', label: 'poser une question' },
  { glyph: '+', intent: 'donner mon avis', label: 'donner un avis' },
  { glyph: '➔', intent: 'changer de sujet', label: 'changer de sujet' },
];

/**
 * A selectable keyword with its intent actions. The word itself is the primary
 * action; the intents (ask / opine / change topic) sit behind a single "more
 * actions" control so switch-scanning stays light (2 stops per chip when
 * collapsed) while staying fully reachable by touch, keyboard and scanning —
 * the actions used to be hover-only and thus unreachable for those users.
 */
const KeywordChip: FC<KeywordChipProps> = ({
  word,
  onWordClick,
  onIntentClick,
}) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className='flex flex-row items-center p-px bg-sage rounded-2xl transition-all'>
      <button
        data-scan-item
        className='h-10 cursor-pointer focus:outline-none focus:ring-2 focus:ring-sage rounded-l-2xl'
        onClick={() => onWordClick(word)}
      >
        <div className='flex flex-col justify-center px-3 h-full text-sm text-sage-600 font-medium bg-sage-tint rounded-l-2xl'>
          {word}
        </div>
      </button>

      <div className='flex flex-row items-center h-10 bg-sage-tint rounded-r-2xl border-l border-sage/25 pr-0.5'>
        {expanded &&
          INTENTS.map(({ glyph, intent, label }) => (
            <button
              key={intent}
              data-scan-item
              onClick={() => {
                onIntentClick(word, intent);
                setExpanded(false);
              }}
              aria-label={`${word} — ${label}`}
              title={label}
              className='flex items-center justify-center min-w-8 h-full rounded-md text-sage-600 hover:text-sage text-sm font-bold px-1.5 focus:outline-none focus:ring-2 focus:ring-sage'
            >
              {glyph}
            </button>
          ))}

        {/* Single control: opens the intents when collapsed, closes them when
            expanded. One scan stop / one tap either way. */}
        <button
          data-scan-item
          onClick={() => setExpanded((prev) => !prev)}
          aria-expanded={expanded}
          aria-label={
            expanded
              ? `${word} — fermer les actions`
              : `${word} — plus d'actions`
          }
          title={expanded ? 'Fermer' : "Plus d'actions"}
          className='flex items-center justify-center min-w-8 h-full px-2 rounded-r-2xl text-sage-600 hover:text-sage text-sm font-bold focus:outline-none focus:ring-2 focus:ring-sage'
        >
          {expanded ? '×' : '⋯'}
        </button>
      </div>
    </div>
  );
};

export default KeywordChip;
