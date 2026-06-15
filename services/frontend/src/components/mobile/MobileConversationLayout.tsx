'use client';

import { ArrowLeft, Pause, Settings } from 'lucide-react';
import {
  useState,
  useCallback,
  useEffect,
  useRef,
  ChangeEvent,
  KeyboardEvent,
  FC,
} from 'react';
import EmergencyButton from '@/components/EmergencyButton';
import QuickPhrases from '@/components/QuickPhrases';
import { PendingResponse } from '@/components/chat/ChatInterface';
import ChatPanel from '@/components/mobile/ChatPanel';
import HistoryPanel from '@/components/mobile/HistoryPanel';
import ResponsePanel from '@/components/mobile/ResponsePanel';
import { ResponseSize, RESPONSES_SIZES } from '@/constants';
import { useViewportHeight } from '@/hooks/useViewportHeight';
import { useTranslations } from '@/i18n';
import { ChatMessage } from '@/types/chatHistory';
import { Conversation, QuickPhrase } from '@/utils/userData';

type ActivePanel = 'chat' | 'responses' | 'history';

interface MobileConversationLayoutProps {
  textInput: string;
  onTextInputChange: (value: string) => void;
  onSendMessage: () => void;
  frozenResponses: PendingResponse[] | null;
  onFreezeToggle: () => void;
  pendingResponses: PendingResponse[];
  onResponseEdit?: (text: string) => void;
  onResponseSelect: (responseId: string) => void;
  onResponseSizeChange?: (size: ResponseSize) => void;
  onConnectButtonPress: () => void;
  onSettingsPress: () => void;
  chatHistory: ChatMessage[];
  isConnected: boolean;
  currentSpeakerMessage?: string;
  conversations: Conversation[];
  selectedConversationIndex: number | null;
  onConversationSelect: (index: number) => void;
  onNewConversation: () => void;
  onDeleteConversation: (index: number) => void;
  pastConversation?: Conversation;
  isViewingPastConversation?: boolean;
  initialActivePanel?: ActivePanel;
  onBack?: () => void;
  isHistoryMode?: boolean;
  additionalKeywords?: string[];
  quickPhrases?: QuickPhrase[];
  onQuickPhraseSelect?: (text: string) => void;
  isInitiating?: boolean;
  onToggleInitiating?: () => void;
}

// Size sent to the backend per tab:
// Chat tab shows compact chips → request short responses from the LLM
// Responses tab shows full cards → request medium responses
// History tab shows past conversation → use compact XS (same as chat)
const SIZE_BY_PANEL: Record<ActivePanel, ResponseSize> = {
  chat: RESPONSES_SIZES.XS,
  responses: RESPONSES_SIZES.M,
  history: RESPONSES_SIZES.XS,
};

const MobileConversationLayout: FC<MobileConversationLayoutProps> = ({
  textInput,
  onTextInputChange,
  onSendMessage,
  frozenResponses,
  onFreezeToggle,
  pendingResponses,
  onResponseEdit = undefined,
  onResponseSelect,
  onResponseSizeChange = undefined,
  onConnectButtonPress,
  onSettingsPress,
  chatHistory,
  isConnected,
  currentSpeakerMessage = '',
  conversations,
  selectedConversationIndex,
  onConversationSelect,
  onNewConversation,
  onDeleteConversation,
  pastConversation = undefined,
  isViewingPastConversation = false,
  initialActivePanel = 'chat',
  onBack = undefined,
  isHistoryMode = false,
  additionalKeywords = [],
  quickPhrases = [],
  onQuickPhraseSelect = undefined,
  isInitiating = false,
  onToggleInitiating = undefined,
}) => {
  const t = useTranslations();
  const [activePanel, setActivePanel] =
    useState<ActivePanel>(initialActivePanel);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { vh, visualVh } = useViewportHeight();
  const keyboardHeight = Math.max(0, vh - visualVh);

  // Active session (connected, not browsing history): show chat AND the four
  // responses on the same screen so picking an answer is one tap, no tab switch.
  // History/past-conversation browsing keeps the Chat/History tabs.
  const isSplitView = isConnected && !isHistoryMode;

  // Notify backend of the desired response size. In the split view the four
  // medium cards are always visible (M); otherwise it follows the active tab.
  useEffect(() => {
    const size = isSplitView ? RESPONSES_SIZES.M : SIZE_BY_PANEL[activePanel];
    onResponseSizeChange?.(size);
  }, [activePanel, isSplitView, onResponseSizeChange]);

  // Switch to chat when a past conversation is selected; back to history when returning to history list
  useEffect(() => {
    if (isViewingPastConversation) {
      setActivePanel('chat');
    } else if (isHistoryMode) {
      setActivePanel('history');
    }
  }, [isViewingPastConversation, isHistoryMode]);

  const onMessageChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      onTextInputChange(event.target.value);
    },
    [onTextInputChange],
  );
  const onMessageKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        onSendMessage();
      }
    },
    [onSendMessage],
  );

  // When user taps Edit on a response card: fill the text input and switch to chat tab
  const handleEditResponse = useCallback(
    (text: string) => {
      onTextInputChange(text);
      setActivePanel('chat');
      // Focus the textarea and place cursor at end to open the keyboard
      setTimeout(() => {
        const el = textareaRef.current;
        if (el) {
          el.focus();
          el.setSelectionRange(el.value.length, el.value.length);
        }
      }, 0);
    },
    [onTextInputChange],
  );

  return (
    <div
      className='w-full flex flex-col bg-paper text-ink overflow-hidden'
      style={{
        height: `${vh}px`,
        paddingBottom: keyboardHeight > 0 ? `${keyboardHeight}px` : undefined,
      }}
    >
      {/* Safe area spacer for notch/status bar */}
      <div
        style={{ height: 'var(--safe-area-inset-top)' }}
        className='shrink-0'
      />

      {/* Header with stop/back button - fixed height, reduced in landscape */}
      <div className='flex items-center justify-between px-4 py-3 landscape:py-1 shrink-0 h-[60px] landscape:h-[44px]'>
        {isConnected ? (
          <button
            aria-label='Stop conversation'
            className='shrink-0 h-11 px-5 cursor-pointer bg-terra-tint border border-terra text-terra rounded-2xl flex flex-row items-center justify-center gap-2 text-sm'
            onClick={onConnectButtonPress}
            title={t('conversation.stopConversation')}
          >
            {t('conversation.stopConversation')}
            <Pause
              width={24}
              height={24}
              className='shrink-0'
            />
          </button>
        ) : (
          <button
            aria-label='Back'
            className='shrink-0 h-11 px-5 cursor-pointer bg-surface border border-hairline-2 text-ink-2 hover:bg-paper transition-colors rounded-2xl flex flex-row items-center justify-center gap-2 text-sm'
            onClick={onBack}
            title={t('common.back')}
          >
            <ArrowLeft
              width={20}
              height={20}
              className='shrink-0'
            />
            {t('common.back')}
          </button>
        )}
        <div className='flex flex-row items-center gap-2'>
          {isConnected && !isHistoryMode && onToggleInitiating && (
            <button
              onClick={onToggleInitiating}
              data-scan-item
              title={t('conversation.takeFloorHint')}
              className={`shrink-0 h-11 px-3 rounded-2xl text-xs font-medium border transition-colors ${
                isInitiating
                  ? 'bg-sage text-white border-sage'
                  : 'bg-surface text-ink-2 border-hairline-2'
              }`}
            >
              {t('conversation.takeFloor')}
            </button>
          )}
          <EmergencyButton compact />
          <button
            className='shrink-0 h-11 px-3 cursor-pointer bg-surface border border-hairline-2 hover:bg-paper transition-colors shadow-[var(--sh-sm)] rounded-2xl flex flex-row items-center justify-center text-ink-2'
            onClick={onSettingsPress}
            title={t('settings.changeSettings')}
          >
            <Settings size={20} />
          </button>
        </div>
      </div>

      {/* Tab bar — only while browsing history (Chat read-only + History).
          During an active session the split view below replaces the tabs. */}
      {!isSplitView && (
        <div className='flex border-b border-hairline shrink-0'>
          <button
            className={`flex-1 py-3 landscape:py-1 min-h-[44px] text-sm font-medium transition-colors ${
              activePanel === 'chat'
                ? 'text-blue-600 border-b-2 border-blue'
                : 'text-muted hover:text-ink'
            }`}
            onClick={() => setActivePanel('chat')}
          >
            {t('conversation.chat')}
          </button>
          <button
            className={`flex-1 py-3 landscape:py-1 min-h-[44px] text-sm font-medium transition-colors ${
              activePanel === 'history'
                ? 'text-blue-600 border-b-2 border-blue'
                : 'text-muted hover:text-ink'
            }`}
            onClick={() => setActivePanel('history')}
          >
            {t('conversation.history')}
          </button>
        </div>
      )}

      {/* Main panel — flex-1 min-h-0 fills the remaining space without overflow. */}
      {isSplitView ? (
        // Active session: chat on top, the four responses below, both visible.
        // Tablet/landscape: side by side. Chat gets a bit more room than the cards.
        <div className='flex-1 min-h-0 flex flex-col md:flex-row md:gap-4 md:px-2 landscape:flex-row landscape:gap-2'>
          <div className='flex flex-col flex-[3] min-h-0 md:flex-1 landscape:flex-1'>
            <ChatPanel
              chatHistory={chatHistory}
              isConnected={isConnected}
              currentSpeakerMessage={currentSpeakerMessage}
              pastConversation={pastConversation}
              isViewingPastConversation={isViewingPastConversation}
            />
          </div>
          <div className='flex flex-col flex-[4] min-h-0 border-t border-hairline md:flex-1 md:border-t-0 landscape:flex-1 landscape:border-t-0'>
            <ResponsePanel
              frozenResponses={frozenResponses}
              onFreezeToggle={onFreezeToggle}
              pendingResponses={pendingResponses}
              onResponseEdit={onResponseEdit}
              onResponseSelect={onResponseSelect}
              onEditResponseInChat={handleEditResponse}
              additionalKeywords={additionalKeywords}
            />
          </div>
        </div>
      ) : (
        // History/past-conversation browsing: tabs drive which panel is shown.
        <div className='flex-1 min-h-0 flex flex-col'>
          <div
            className={
              activePanel === 'chat' ? 'flex flex-col flex-1 min-h-0' : 'hidden'
            }
          >
            <ChatPanel
              chatHistory={chatHistory}
              isConnected={isConnected}
              currentSpeakerMessage={currentSpeakerMessage}
              pastConversation={pastConversation}
              isViewingPastConversation={isViewingPastConversation}
            />
          </div>
          <div
            className={
              activePanel === 'history'
                ? 'flex flex-col flex-1 min-h-0'
                : 'hidden'
            }
          >
            <HistoryPanel
              conversations={conversations}
              selectedConversationIndex={selectedConversationIndex}
              onConversationSelect={onConversationSelect}
              onNewConversation={onNewConversation}
              onDeleteConversation={onDeleteConversation}
            />
          </div>
        </div>
      )}

      {/* Always-visible text input footer */}
      <div className='px-4 pt-2 pb-1 landscape:pt-1 landscape:pb-0 border-t border-hairline shrink-0'>
        {/* Quick phrases: instant speech, no LLM round-trip. Hidden when viewing history. */}
        {!isHistoryMode && quickPhrases.length > 0 && onQuickPhraseSelect && (
          <div className='mb-2 landscape:hidden'>
            <QuickPhrases
              phrases={quickPhrases}
              onSelect={onQuickPhraseSelect}
              compact
            />
          </div>
        )}
        <div className='flex gap-2 pb-1'>
          <textarea
            ref={textareaRef}
            className='flex-1 p-2 bg-surface-2 border border-hairline-2 rounded-lg text-ink placeholder-muted resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue text-sm max-h-[96px] overflow-y-auto'
            placeholder={t('conversation.typeMessagePlaceholder')}
            rows={1}
            value={textInput}
            onChange={onMessageChange}
            onKeyDown={onMessageKeyDown}
          />
          <button
            className='px-3 py-2 bg-blue text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 text-sm min-w-[56px] min-h-[44px]'
            onClick={onSendMessage}
            disabled={!textInput.trim()}
          >
            {t('conversation.sendMessage')}
          </button>
        </div>
      </div>

      {/* Safe area spacer for home indicator */}
      <div
        style={{ height: 'var(--safe-area-inset-bottom)' }}
        className='shrink-0'
      />
    </div>
  );
};

export default MobileConversationLayout;
