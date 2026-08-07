'use client';

import {
  Archive,
  ArchiveRestore,
  ChevronDown,
  ChevronRight,
  MessageSquare,
  MoreVertical,
  Plus,
  Trash2,
} from 'lucide-react';
import { FC, Fragment, useCallback, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from '@/i18n';
import type { Locale } from '@/i18n/config';
import { cn } from '@/utils/cn';
import {
  DAY_GROUP_ORDER,
  formatConversationDate,
  formatConversationPreview,
  getDayGroup,
  getDayGroupLabel,
  type DayGroupKey,
} from '@/utils/conversationUtils';
import { Conversation } from '@/utils/userData';

export interface HistoryPanelProps {
  conversations: Conversation[];
  selectedConversationIndex: number | null;
  onConversationSelect: (index: number) => void;
  onNewConversation: () => void;
  onDeleteConversation: (index: number) => void;
  onArchiveConversation: (index: number, archived: boolean) => void;
}

// Long-press duration (ms) before the action menu opens. Long enough not to
// fire on a normal tap-to-open, short enough to feel responsive.
const LONG_PRESS_MS = 500;

interface ConversationRowProps {
  conversation: Conversation;
  conversations: Conversation[];
  selectedConversationIndex: number | null;
  onConversationSelect: (index: number) => void;
  onDeleteConversation: (index: number) => void;
  onArchiveConversation: (index: number, archived: boolean) => void;
  openMenuIndex: number | null;
  onOpenMenu: (index: number | null) => void;
  t: (key: string) => string;
  locale: Locale;
}

const ConversationRow: FC<ConversationRowProps> = ({
  conversation,
  conversations,
  selectedConversationIndex,
  onConversationSelect,
  onDeleteConversation,
  onArchiveConversation,
  openMenuIndex,
  onOpenMenu,
  t,
  locale,
}) => {
  const originalIndex = useMemo(() => {
    return conversations.findIndex(
      (c) => JSON.stringify(c) === JSON.stringify(conversation),
    );
  }, [conversation, conversations]);

  const isSelected = selectedConversationIndex === originalIndex;
  const isMenuOpen = openMenuIndex === originalIndex;
  const isArchived = conversation.archived === true;

  // Long-press handling. A press held for LONG_PRESS_MS opens the action menu;
  // a shorter press falls through to the row's normal select behavior. We track
  // whether the long-press fired so the click that follows pointerup doesn't
  // also trigger a select.
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);

  const clearLongPress = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const handlePointerDown = useCallback(() => {
    longPressFired.current = false;
    clearLongPress();
    longPressTimer.current = setTimeout(() => {
      longPressFired.current = true;
      onOpenMenu(originalIndex);
    }, LONG_PRESS_MS);
  }, [clearLongPress, onOpenMenu, originalIndex]);

  const handleClick = useCallback(() => {
    clearLongPress();
    // Suppress the select that would otherwise follow a long-press.
    if (longPressFired.current) {
      longPressFired.current = false;
      return;
    }
    onConversationSelect(originalIndex);
  }, [clearLongPress, onConversationSelect, originalIndex]);

  const handleDelete = useCallback(() => {
    onOpenMenu(null);
    onDeleteConversation(originalIndex);
  }, [onOpenMenu, onDeleteConversation, originalIndex]);

  const handleArchiveToggle = useCallback(() => {
    onOpenMenu(null);
    onArchiveConversation(originalIndex, !isArchived);
  }, [onOpenMenu, onArchiveConversation, originalIndex, isArchived]);

  const preview = formatConversationPreview(conversation, t);
  const date = formatConversationDate(conversation, t, locale);
  const secondaryPreview =
    preview.length > 60 ? `${preview.slice(0, 60)}…` : preview;

  return (
    <div className='relative shrink-0'>
      <button
        className={cn(
          'w-full min-h-[52px] text-left px-3.5 py-3 rounded-md border-2 transition-colors',
          isSelected
            ? 'bg-blue-tint border-blue'
            : 'bg-surface border-hairline hover:bg-surface-2',
        )}
        onClick={handleClick}
        onPointerDown={handlePointerDown}
        onPointerUp={clearLongPress}
        onPointerLeave={clearLongPress}
        onPointerCancel={clearLongPress}
        onContextMenu={(e) => {
          e.preventDefault();
          onOpenMenu(originalIndex);
        }}
      >
        <div className='flex flex-col gap-1 pr-10'>
          <p className='line-clamp-1 text-sm font-medium text-ink'>
            {secondaryPreview}
          </p>
          {date && <span className='text-xs text-muted'>{date}</span>}
        </div>
      </button>

      {/* Always-visible "more" affordance: an accessible, discoverable path to
          the same menu for users who cannot perform a long-press (switch
          access, dwell). */}
      <button
        className='absolute right-2 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center text-muted hover:text-ink transition-colors'
        onClick={(e) => {
          e.stopPropagation();
          onOpenMenu(isMenuOpen ? null : originalIndex);
        }}
        title={t('conversation.moreActions')}
        aria-haspopup='menu'
        aria-expanded={isMenuOpen}
      >
        <MoreVertical size={18} />
      </button>

      {isMenuOpen && (
        <Fragment>
          {/* Full-screen backdrop to dismiss on outside tap. */}
          <div
            className='fixed inset-0 z-40'
            onClick={() => onOpenMenu(null)}
            onPointerDown={() => onOpenMenu(null)}
            aria-hidden
          />
          <div
            className='absolute right-2 top-12 z-50 min-w-[180px] rounded-xl border border-hairline bg-surface shadow-lg overflow-hidden'
            role='menu'
          >
            <button
              className='w-full min-h-[48px] flex items-center gap-3 px-4 py-3 text-left text-sm text-ink hover:bg-surface-2 transition-colors'
              onClick={handleArchiveToggle}
              role='menuitem'
            >
              {isArchived ? (
                <ArchiveRestore size={18} />
              ) : (
                <Archive size={18} />
              )}
              {isArchived
                ? t('conversation.unarchive')
                : t('conversation.archive')}
            </button>
            <button
              className='w-full min-h-[48px] flex items-center gap-3 px-4 py-3 text-left text-sm text-red hover:bg-red-tint transition-colors'
              onClick={handleDelete}
              role='menuitem'
            >
              <Trash2 size={18} />
              {t('conversation.deleteConversation')}
            </button>
          </div>
        </Fragment>
      )}
    </div>
  );
};

const HistoryPanel: FC<HistoryPanelProps> = ({
  conversations,
  selectedConversationIndex,
  onConversationSelect,
  onNewConversation,
  onDeleteConversation,
  onArchiveConversation,
}) => {
  const t = useTranslations();
  const locale = useLocale();

  // Which row's action menu is open (by original index), or null. Only one at
  // a time. Kept here (not per-row) so opening one closes any other.
  const [openMenuIndex, setOpenMenuIndex] = useState<number | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const byRecency = useCallback(
    (list: Conversation[]) =>
      structuredClone(list).sort((a, b) => {
        const dateA = a.start_time ? new Date(a.start_time).getTime() : 0;
        const dateB = b.start_time ? new Date(b.start_time).getTime() : 0;
        return dateB - dateA;
      }),
    [],
  );

  // Split into active (shown in the main list) and archived (folded into a
  // collapsible section). Archiving is display-only, so this split is purely
  // about what the user sees — the underlying data is untouched.
  const activeConversations = useMemo(
    () => byRecency(conversations.filter((c) => c.archived !== true)),
    [byRecency, conversations],
  );
  const archivedConversations = useMemo(
    () => byRecency(conversations.filter((c) => c.archived === true)),
    [byRecency, conversations],
  );

  const groupedActive = useMemo(() => {
    const groups = DAY_GROUP_ORDER.reduce(
      (acc, key) => {
        acc[key] = [];
        return acc;
      },
      {} as Record<DayGroupKey, Conversation[]>,
    );
    activeConversations.forEach((conv) => {
      const key = getDayGroup(conv);
      groups[key].push(conv);
    });
    return DAY_GROUP_ORDER.filter((key) => groups[key].length > 0).map(
      (key) => ({ key, items: groups[key] }),
    );
  }, [activeConversations]);

  const dayGroupLabel = (key: DayGroupKey): string => getDayGroupLabel(key, t);

  // `keyPrefix` keeps keys unique across the two lists: without it the first
  // active row and the first archived row would both be key "0" (siblings in
  // the same container), which React forbids.
  const renderRow = (
    conversation: Conversation,
    sortedIndex: number,
    keyPrefix: string,
  ) => (
    <ConversationRow
      key={`${keyPrefix}-${sortedIndex}`}
      conversation={conversation}
      conversations={conversations}
      selectedConversationIndex={selectedConversationIndex}
      onConversationSelect={onConversationSelect}
      onDeleteConversation={onDeleteConversation}
      onArchiveConversation={onArchiveConversation}
      openMenuIndex={openMenuIndex}
      onOpenMenu={setOpenMenuIndex}
      t={t}
      locale={locale}
    />
  );

  return (
    <div className='flex flex-col flex-1 min-h-0 overflow-hidden'>
      {/* "New conversation" button — always shown at top, 44px minimum height */}
      <div className='px-3 pt-3 pb-2 shrink-0'>
        <button
          className='w-full min-h-[52px] flex items-center justify-center gap-2 px-4 py-2 bg-blue-tint border-2 border-blue text-blue-600 rounded-md text-sm font-bold hover:bg-blue-tint-2 transition-colors'
          onClick={onNewConversation}
        >
          <Plus size={16} />
          {t('conversation.newChat')}
        </button>
      </div>

      {/* Scrollable conversation list */}
      <div className='flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 pb-4 flex flex-col gap-2'>
        {/* Empty state — only when there is nothing at all (no active, no
            archived). */}
        {activeConversations.length === 0 &&
          archivedConversations.length === 0 && (
            <div className='flex flex-col items-center justify-center flex-1 text-muted py-12'>
              <MessageSquare
                size={40}
                className='mb-3 opacity-50'
              />
              <p className='text-sm'>{t('conversation.noConversationsYet')}</p>
            </div>
          )}

        {/* Active conversation rows — grouped by day (wireframe 2a) */}
        {groupedActive.map(({ key, items }) => (
          <Fragment key={key}>
            <div className='text-[11px] font-bold uppercase tracking-wide text-muted px-0.5 pt-1'>
              {dayGroupLabel(key)}
            </div>
            {items.map((conversation, i) =>
              renderRow(conversation, i, `active-${key}`),
            )}
          </Fragment>
        ))}

        {/* Archived section — collapsible, hidden entirely when empty. */}
        {archivedConversations.length > 0 && (
          <Fragment>
            <button
              className='mt-2 min-h-[44px] flex items-center gap-2 px-2 py-2 text-left text-sm text-muted hover:text-ink transition-colors'
              onClick={() => setShowArchived((prev) => !prev)}
              aria-expanded={showArchived}
            >
              {showArchived ? (
                <ChevronDown size={16} />
              ) : (
                <ChevronRight size={16} />
              )}
              {t('conversation.archivedConversations')} (
              {archivedConversations.length})
            </button>
            {showArchived &&
              archivedConversations.map((conversation, i) =>
                renderRow(conversation, i, 'archived'),
              )}
          </Fragment>
        )}
      </div>
    </div>
  );
};

export default HistoryPanel;
