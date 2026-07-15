'use client';

import { CalendarClock, Users, X } from 'lucide-react';
import { Fragment, type FC } from 'react';
import type { PendingKeyword } from '@/components/ConversationLayout';
import KeywordChip from '@/components/KeywordChip';
import KeywordsSuggestion from '@/components/KeywordsSuggestion';
import QuickPhrases from '@/components/QuickPhrases';
import AppointmentLauncher from '@/components/appointments/AppointmentLauncher';
import { useTranslations } from '@/i18n';
import { cn } from '@/utils/cn';
import type { Appointment, QuickPhrase } from '@/utils/userData';

interface AccessoriesDrawerProps {
  open: boolean;
  onClose: () => void;
  additionalKeywords?: string[];
  friends?: string[];
  quickPhrases: QuickPhrase[];
  appointments: Appointment[];
  voiceName?: string | null;
  lang?: string | null;
  pendingKeywords: PendingKeyword[];
  userDataError: string | null;
  settingsBlockedMessage: string | null;
  onWordBubbleClick: (word: string) => void;
  onKeywordSelect: (keywordText: string) => void;
  onIntentClick: (word: string, intent: string) => void;
  onQuickPhraseSelect: (phraseText: string) => void;
}

/**
 * Slide-in panel grouping the secondary conversation tools: keywords, friends,
 * quick phrases, keyword suggestions, and appointments. On wide screens it can
 * stay pinned as a third column; on narrow screens it slides over the content.
 *
 * The primary conversation surface (chat + 4 responses + text input) is
 * intentionally kept free of this chrome so the core interaction — pick an
 * answer — is never crowded out.
 */
const AccessoriesDrawer: FC<AccessoriesDrawerProps> = ({
  open,
  onClose,
  additionalKeywords = [],
  friends = [],
  quickPhrases,
  appointments,
  voiceName = null,
  lang = null,
  pendingKeywords,
  userDataError,
  settingsBlockedMessage,
  onWordBubbleClick,
  onKeywordSelect,
  onIntentClick,
  onQuickPhraseSelect,
}) => {
  const t = useTranslations();

  return (
    <Fragment>
      {/* Backdrop: only on narrow screens (lg:transparent lg:pointer-events-none) */}
      {open && (
        <div
          className='fixed inset-0 z-40 bg-ink/30 backdrop-blur-[2px] lg:bg-transparent lg:backdrop-blur-none lg:pointer-events-none transition-opacity'
          onClick={onClose}
          aria-hidden='true'
        />
      )}

      {/* Panel */}
      <aside
        className={cn(
          'fixed top-0 right-0 z-40 h-dvh w-[88vw] max-w-sm',
          'bg-surface border-l border-hairline shadow-[var(--sh-lg)]',
          'flex flex-col overflow-y-auto p-4 gap-4',
          'transition-transform duration-300 ease-out',
          open ? 'translate-x-0' : 'translate-x-full',
          // On wide screens the drawer is a pinned third column (always visible,
          // never translated off-screen, never display:none so content stays in
          // the accessibility tree and test queries find it even when "closed").
          'lg:relative lg:h-auto lg:w-72 lg:translate-x-0 lg:transition-none lg:z-0 lg:shadow-none lg:rounded-none',
        )}
        aria-hidden={!open}
      >
        {/* Close button — hidden on lg where the drawer is pinned */}
        <button
          className='absolute top-3 right-3 lg:hidden h-11 w-11 flex items-center justify-center text-muted hover:text-ink rounded-2xl hover:bg-paper transition-colors'
          onClick={onClose}
          aria-label={t('common.close')}
        >
          <X size={20} />
        </button>

        {/* Appointments */}
        {appointments.length > 0 && (
          <section>
            <div className='flex items-center gap-2 mb-2 text-sm font-medium text-ink'>
              <CalendarClock size={16} />
              {t('settings.appointments')}
            </div>
            <AppointmentLauncher
              appointments={appointments}
              voiceName={voiceName}
              lang={lang}
              compact
            />
          </section>
        )}

        {/* Keywords */}
        <section className='w-full px-4 py-3 bg-paper border border-hairline rounded-2xl'>
          <div className='mb-1 text-sm font-medium text-ink'>
            {t('conversation.keywords')}
          </div>
          <div className='flex flex-wrap gap-1.5 min-h-6 max-h-32 overflow-y-auto overflow-x-hidden py-2 px-0.5'>
            {additionalKeywords.map((word) => (
              <KeywordChip
                key={word}
                word={word}
                onWordClick={onWordBubbleClick}
                onIntentClick={onIntentClick}
              />
            ))}
            {additionalKeywords.length === 0 && (
              <p className='text-xs italic text-muted'>
                {t('conversation.noKeywordsYet')}
              </p>
            )}
          </div>
        </section>

        {/* Friends */}
        <section className='w-full px-4 py-3 bg-paper border border-hairline rounded-2xl'>
          <div className='flex items-center gap-2 mb-1 text-sm font-medium text-ink'>
            <Users size={16} />
            {t('common.friends')}
          </div>
          <div className='flex flex-wrap gap-1.5 min-h-6 max-h-32 overflow-y-auto overflow-x-hidden py-2 px-0.5'>
            {friends.map((friend) => (
              <button
                key={friend}
                data-scan-item
                onClick={() => onWordBubbleClick(friend)}
                className='h-10 p-px transition-colors cursor-pointer bg-blue rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue'
              >
                <div className='flex flex-col justify-center px-3 h-full text-sm text-blue-600 font-medium bg-blue-tint rounded-2xl'>
                  {friend}
                </div>
              </button>
            ))}
            {friends.length === 0 && (
              <p className='text-xs italic text-muted'>
                {t('settings.noFriendsAdded')}
              </p>
            )}
          </div>
        </section>

        {/* Quick phrases */}
        {quickPhrases.length > 0 && (
          <section>
            <QuickPhrases
              phrases={quickPhrases}
              onSelect={onQuickPhraseSelect}
            />
          </section>
        )}

        {/* Keyword suggestions from the LLM */}
        <section>
          <KeywordsSuggestion
            keywords={pendingKeywords}
            onSelect={onKeywordSelect}
            alwaysShow
          />
        </section>

        {/* Error / toast messages that used to live inline */}
        {userDataError && (
          <div className='p-2 border-b border-hairline'>
            <span className='text-xs text-red-400'>
              {t('errors.failedToLoadUserData')}
            </span>
          </div>
        )}
        {settingsBlockedMessage && (
          <div className='p-2'>
            <div className='px-2 py-1 text-xs text-yellow-200 border border-yellow-500 rounded bg-yellow-900/20'>
              {settingsBlockedMessage}
            </div>
          </div>
        )}
      </aside>
    </Fragment>
  );
};

export default AccessoriesDrawer;
