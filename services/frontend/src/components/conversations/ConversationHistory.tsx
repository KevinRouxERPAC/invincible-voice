import {
  Archive,
  ArchiveRestore,
  ChevronDown,
  ChevronRight,
  MessageSquare,
  X,
} from 'lucide-react';
import { Fragment, useCallback, useMemo, useState } from 'react';
import ChatBubble from '@/components/icons/ChatBubble';
import NewConversation from '@/components/icons/NewConversation';
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

interface ConversationHistoryProps {
  conversations: Conversation[];
  selectedConversationIndex: number | null;
  onConversationSelect: (index: number) => void;
  onNewConversation: () => void;
  onDeleteConversation: (index: number) => void;
  onArchiveConversation: (index: number, archived: boolean) => void;
}

const getConversationMessageCount = (conversation: Conversation): string => {
  return conversation.messages.length > 99
    ? '99+'
    : conversation.messages.length.toString();
};

const ConversationHistory = ({
  conversations,
  selectedConversationIndex,
  onConversationSelect,
  onNewConversation,
  onDeleteConversation,
  onArchiveConversation,
}: ConversationHistoryProps) => {
  const t = useTranslations();
  const locale = useLocale();
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

  // Archiving is display-only: split what the user sees without touching data.
  const activeConversations = useMemo(
    () => byRecency(conversations.filter((c) => c.archived !== true)),
    [byRecency, conversations],
  );
  const archivedConversations = useMemo(
    () => byRecency(conversations.filter((c) => c.archived === true)),
    [byRecency, conversations],
  );

  // Group active conversations by day (wireframe 2a: Aujourd'hui / Hier / …)
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

  // `keyPrefix` keeps keys unique across the active and archived lists (both
  // render into the same container, so a shared "0" key would clash).
  const renderCard = (
    conversation: Conversation,
    index: number,
    keyPrefix: string,
  ) => (
    <ConversationCard
      key={`${keyPrefix}-${index}`}
      conversation={conversation}
      conversations={conversations}
      onDeleteConversation={onDeleteConversation}
      onArchiveConversation={onArchiveConversation}
      onSelectConversation={onConversationSelect}
      selectedConversationIndex={selectedConversationIndex}
      t={t}
      locale={locale}
    />
  );

  return (
    <div className='relative flex flex-col shrink-0 h-full w-80'>
      <div className='flex flex-col flex-1 gap-2 px-6 pt-6 pb-10 overflow-y-auto overscroll-contain scrollbar-hidden'>
        {activeConversations.length === 0 &&
        archivedConversations.length === 0 ? (
          <div className='p-4 text-center text-muted'>
            <MessageSquare
              size={48}
              className='mx-auto mb-2 opacity-50'
            />
            <p className='text-sm'>{t('conversation.noConversationsYet')}</p>
            <p className='mt-1 text-xs text-muted'>
              {t('conversation.startFirstConversation')}
            </p>
          </div>
        ) : (
          <Fragment>
            {groupedActive.map(({ key, items }) => (
              <Fragment key={key}>
                <div className='mt-2 first:mt-0 text-[11px] font-bold uppercase tracking-wide text-muted px-1'>
                  {getDayGroupLabel(key, t)}
                </div>
                {items.map((conversation, i) =>
                  renderCard(conversation, i, `active-${key}`),
                )}
              </Fragment>
            ))}

            {archivedConversations.length > 0 && (
              <Fragment>
                <button
                  className='mt-2 min-h-[44px] flex items-center gap-2 px-1 py-2 text-left text-sm text-muted hover:text-ink transition-colors'
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
                    renderCard(conversation, i, 'archived'),
                  )}
              </Fragment>
            )}
          </Fragment>
        )}
      </div>
      {selectedConversationIndex !== null && (
        <button
          onClick={onNewConversation}
          className='sticky shrink-0 bottom-6 w-[calc(100%-3rem)] left-6 bg-blue hover:bg-blue-600 transition-colors rounded-2xl h-14 cursor-pointer flex flex-row items-center justify-center gap-1 text-sm text-white'
        >
          {t('conversation.newChat')}
          <NewConversation
            width={24}
            height={24}
            className='shrink-0 text-white'
          />
        </button>
      )}
    </div>
  );
};

export default ConversationHistory;

interface ConversationCardProps {
  conversation: Conversation;
  conversations: Conversation[];
  onDeleteConversation: (index: number) => void;
  onArchiveConversation: (index: number, archived: boolean) => void;
  onSelectConversation: (index: number) => void;
  selectedConversationIndex: number | null;
  t: (key: string) => string;
  locale: Locale;
}

const ConversationCard = ({
  conversation,
  conversations,
  onDeleteConversation,
  onArchiveConversation,
  onSelectConversation,
  selectedConversationIndex,
  t,
  locale,
}: ConversationCardProps) => {
  const originalIndex = useMemo(() => {
    return conversations.findIndex(
      (c) => JSON.stringify(c) === JSON.stringify(conversation),
    );
  }, [conversation, conversations]);
  const isSelected = selectedConversationIndex === originalIndex;
  const isArchived = conversation.archived === true;
  const onClickConversationCard = useCallback(() => {
    onSelectConversation(originalIndex);
  }, [onSelectConversation, originalIndex]);
  const onClickDeleteConversation = useCallback(() => {
    onDeleteConversation(originalIndex);
  }, [onDeleteConversation, originalIndex]);
  const onClickArchiveConversation = useCallback(() => {
    onArchiveConversation(originalIndex, !isArchived);
  }, [onArchiveConversation, originalIndex, isArchived]);

  return (
    <div className='relative'>
      <button
        className={cn(
          'relative shrink-0 w-full h-28 cursor-pointer p-px group',
          {
            'bg-blue rounded-tr-sm rounded-b-2xl rounded-tl-2xl': isSelected,
            'bg-surface border border-hairline shadow-[var(--sh-sm)] rounded-2xl':
              !isSelected,
          },
        )}
        onClick={onClickConversationCard}
      >
        <div
          className={cn(
            'hover:bg-surface-2 bg-surface w-full h-full flex flex-col gap-4 relative rounded-b-2xl rounded-tl-2xl',
            {
              'bg-blue-tint rounded-tr-sm': isSelected,
              'rounded-tr-2xl': !isSelected,
            },
          )}
        >
          <div className='flex flex-row gap-2 px-5 pt-3'>
            <div className='relative'>
              <ChatBubble
                width={24}
                height={24}
                className='shrink-0 text-muted'
              />
              <span className='absolute inset-0 text-[10px] flex flex-col items-center justify-center font-semibold pb-0.5 text-ink'>
                {getConversationMessageCount(conversation)}
              </span>
            </div>
            <div className='text-sm text-muted'>
              {formatConversationDate(conversation, t, locale)}
            </div>
          </div>
          <div className='px-5 text-sm font-medium line-clamp-2'>
            {formatConversationPreview(conversation, t)}
          </div>
        </div>
      </button>
      <div
        className={cn(
          'absolute right-2 top-2 flex items-center gap-1 group-hover:visible',
          { invisible: !isSelected },
        )}
      >
        <button
          onClick={onClickArchiveConversation}
          className='text-muted hover:text-ink transition-colors'
          title={
            isArchived ? t('conversation.unarchive') : t('conversation.archive')
          }
        >
          {isArchived ? <ArchiveRestore size={16} /> : <Archive size={16} />}
        </button>
        <button
          onClick={onClickDeleteConversation}
          className='text-muted hover:text-red transition-colors'
          title={t('conversation.deleteConversation')}
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
};
