'use client';

import {
  ArrowLeft,
  Compass,
  Keyboard,
  List,
  Megaphone,
  Play,
  Settings,
  X,
} from 'lucide-react';
import { prettyPrintJson } from 'pretty-print-json';
import {
  Fragment,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FC,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import AccessoriesDrawer from '@/components/AccessoriesDrawer';
import EmergencyButton from '@/components/EmergencyButton';
import QuickPhrases from '@/components/QuickPhrases';
import type { PendingResponse } from '@/components/chat/ChatInterface';
import ConversationHistory from '@/components/conversations/ConversationHistory';
import ChatPanel from '@/components/mobile/ChatPanel';
import HistoryPanel from '@/components/mobile/HistoryPanel';
import QuickPhrasesSheet from '@/components/mobile/QuickPhrasesSheet';
import ResponsePanel from '@/components/mobile/ResponsePanel';
import MobileSettingsPopup from '@/components/settings/MobileSettingsPopup';
import SettingsPopup from '@/components/settings/SettingsPopup';
import BrandLogos from '@/components/ui/BrandLogos';
import ErrorMessages, { type ErrorItem } from '@/components/ui/ErrorMessages';
import { RESPONSES_SIZES, type ResponseSize } from '@/constants';
import useKeyboardShortcuts from '@/hooks/useKeyboardShortcuts';
import { useViewportHeight } from '@/hooks/useViewportHeight';
import { useTranslations } from '@/i18n';
import type { ChatMessage } from '@/types/chatHistory';
import { cn } from '@/utils/cn';
import {
  getStaticContextOption,
  getStaticRepeatOption,
} from '@/utils/conversationUtils';
import { triggerHapticFeedback } from '@/utils/haptics';
import { isNativeApp } from '@/utils/platform';
import type { UserData, UserSettings } from '@/utils/userData';

export interface PendingKeyword {
  id: string;
  text: string;
  isComplete: boolean;
}

export interface ConversationLayoutProps {
  shouldConnect: boolean;
  onConnectButtonPress: () => void;
  isMobile: boolean;
  chatHistory: ChatMessage[];
  currentSpeakerMessage: string;
  pendingResponses: PendingResponse[];
  frozenResponses: PendingResponse[] | null;
  onResponseSelect: (responseId: string) => void;
  onResponseEdit: (text: string) => void;
  onResponseSizeChange: (size: ResponseSize) => void;
  pendingKeywords: PendingKeyword[];
  textInput: string;
  onTextInputChange: (value: string) => void;
  onSendMessage: () => void;
  directiveInput: string;
  onDirectiveInputChange: (value: string) => void;
  onDirectiveSubmit: () => void;
  isInitiating: boolean;
  onToggleInitiating: () => void;
  userData: UserData | null;
  userDataError: string | null;
  selectedConversationIndex: number | null;
  isViewingPastConversation: boolean;
  isShowingHistoryFromIdle: boolean;
  onConversationSelect: (index: number) => void;
  onNewConversation: () => void;
  onDeleteConversation: (index: number) => void;
  onArchiveConversation: (index: number, archived: boolean) => void;
  onShowHistoryFromIdle: () => void;
  onBack: () => void;
  isSettingsOpen: boolean;
  settingsBlockedMessage: string | null;
  onSettingsOpen: () => void;
  onSettingsSave: (settings: UserSettings) => void;
  onSettingsCancel: () => void;
  errors: ErrorItem[];
  setErrors: React.Dispatch<React.SetStateAction<ErrorItem[]>>;
  onWordBubbleClick: (word: string) => void;
  onKeywordSelect: (keywordText: string) => void;
  onIntentClick: (word: string, intent: string) => void;
  onQuickPhraseSelect: (phraseText: string) => void;
  debugDict: object | null;
}

type ActivePanel = 'chat' | 'history';

const ConversationLayout: FC<ConversationLayoutProps> = ({
  shouldConnect,
  onConnectButtonPress,
  isMobile,
  chatHistory,
  currentSpeakerMessage,
  pendingResponses,
  frozenResponses,
  onResponseSelect,
  onResponseEdit,
  onResponseSizeChange,
  pendingKeywords,
  textInput,
  onTextInputChange,
  onSendMessage,
  directiveInput,
  onDirectiveInputChange,
  onDirectiveSubmit,
  isInitiating,
  onToggleInitiating,
  userData,
  userDataError,
  selectedConversationIndex,
  isViewingPastConversation,
  isShowingHistoryFromIdle,
  onConversationSelect,
  onNewConversation,
  onDeleteConversation,
  onArchiveConversation,
  onShowHistoryFromIdle,
  onBack,
  isSettingsOpen,
  settingsBlockedMessage,
  onSettingsOpen,
  onSettingsSave,
  onSettingsCancel,
  errors,
  setErrors,
  onWordBubbleClick,
  onKeywordSelect,
  onIntentClick,
  onQuickPhraseSelect,
  debugDict,
}) => {
  const t = useTranslations();
  const { isDevMode } = useKeyboardShortcuts();
  const { vh, visualVh } = useViewportHeight();
  const keyboardHeight = Math.max(0, vh - visualVh);

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isDirectiveOpen, setIsDirectiveOpen] = useState(false);
  const [isQuickPhrasesOpen, setIsQuickPhrasesOpen] = useState(false);
  const [isWriteExpanded, setIsWriteExpanded] = useState(false);
  const [activePanel, setActivePanel] = useState<ActivePanel>(
    isShowingHistoryFromIdle && !isViewingPastConversation ? 'history' : 'chat',
  );
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const directiveInputRef = useRef<HTMLInputElement>(null);

  const staticContextOption = getStaticContextOption(t);
  const staticRepeatOption = getStaticRepeatOption(t);

  const isHistoryMode = isShowingHistoryFromIdle || isViewingPastConversation;
  const isSplitView = shouldConnect && !isHistoryMode;
  const isFocusedMobileSession = isMobile && isSplitView;
  const isHistoryListOnly =
    isMobile && isShowingHistoryFromIdle && !isViewingPastConversation;
  const quickPhrases = userData?.user_settings?.quick_phrases ?? [];

  useEffect(() => {
    if (isViewingPastConversation) {
      setActivePanel('chat');
    } else if (isHistoryMode) {
      setActivePanel('history');
    }
  }, [isViewingPastConversation, isHistoryMode]);

  useEffect(() => {
    if (isDirectiveOpen) {
      directiveInputRef.current?.focus();
    }
  }, [isDirectiveOpen]);

  useEffect(() => {
    if (!shouldConnect) {
      setIsWriteExpanded(false);
      setIsQuickPhrasesOpen(false);
    }
  }, [shouldConnect]);

  // During a session the 4 medium cards are visible (M); history browsing uses XS.
  useEffect(() => {
    const size = isSplitView ? RESPONSES_SIZES.M : RESPONSES_SIZES.XS;
    onResponseSizeChange(size);
  }, [isSplitView, onResponseSizeChange]);

  const onChangeTextInput = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      onTextInputChange(event.target.value);
    },
    [onTextInputChange],
  );
  const onTextInputKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        onSendMessage();
      }
    },
    [onSendMessage],
  );
  const handleEditResponse = useCallback(
    (text: string) => {
      onTextInputChange(text);
      if (isFocusedMobileSession) {
        setIsWriteExpanded(true);
        setTimeout(() => {
          const el = textareaRef.current;
          if (el) {
            el.focus();
            el.setSelectionRange(el.value.length, el.value.length);
          }
        }, 0);
        return;
      }
      setActivePanel('chat');
      setTimeout(() => {
        const el = textareaRef.current;
        if (el) {
          el.focus();
          el.setSelectionRange(el.value.length, el.value.length);
        }
      }, 0);
    },
    [onTextInputChange, isFocusedMobileSession],
  );

  const pastConversation =
    selectedConversationIndex !== null &&
    userData?.conversations[selectedConversationIndex]
      ? userData.conversations[selectedConversationIndex]
      : undefined;

  const renderIdleContent = () => (
    <div className='flex-1 min-h-0 flex flex-col items-center px-4 pb-3 max-w-md mx-auto w-full overflow-y-auto overscroll-contain'>
      {/* my-auto splits the leftover space evenly above and below this block,
          so the content stays visually centered instead of leaving one big
          void before the history link (wireframe 2a). */}
      <div className='my-auto w-full flex flex-col items-center py-4'>
        {/* On mobile the header shows the SOS button, so the brand mark
            belongs here. On desktop the sidebar + header already show it,
            so we skip a third copy to avoid visual redundancy. */}
        {isMobile && (
          <img
            src='/logo_invincible.png'
            alt='Invincible Voice'
            className='logo-themed h-9 mb-8'
          />
        )}
        <button
          onClick={onConnectButtonPress}
          data-scan-item
          className='w-full min-h-[70px] flex items-center justify-center gap-2 px-4 bg-ink text-paper rounded-lg text-lg font-bold hover:opacity-90 transition-opacity'
        >
          <Play
            size={20}
            className='shrink-0'
            fill='currentColor'
          />
          {t('conversation.startChatting')}
        </button>
        <p className='mt-6 mb-2.5 self-start text-[11px] font-bold uppercase tracking-wide text-muted'>
          {t('conversation.quickPhrasesInstant')}
        </p>
        <QuickPhrases
          phrases={quickPhrases}
          onSelect={onQuickPhraseSelect}
          grid
          maxItems={5}
          onEdit={onSettingsOpen}
        />
      </div>
      {isMobile && (
        <button
          className='shrink-0 py-3 text-sm font-bold text-blue hover:text-blue-600 transition-colors'
          onClick={onShowHistoryFromIdle}
        >
          {t('conversation.viewHistory')}
        </button>
      )}
      {!isNativeApp() && (
        <p className='shrink-0 pt-2 text-xs text-muted text-center'>
          {t('common.textToSpeechProvider')}
          <br />
          <img
            src='/gradium.svg'
            alt='Gradium'
            className='h-6 mt-1 inline-block'
          />
        </p>
      )}
    </div>
  );

  // --- Idle: no session, no history browsing ---
  const showIdle =
    !shouldConnect && !isViewingPastConversation && !isShowingHistoryFromIdle;

  const renderHeaderLeft = () => {
    if (shouldConnect) {
      return (
        <button
          aria-label={t('conversation.stopConversationAriaLabel')}
          className='min-w-0 shrink mr-auto h-11 px-3.5 cursor-pointer bg-surface border border-[#c69a6a] text-[#a06a2f] rounded-2xl flex flex-row items-center justify-center gap-1.5 text-sm font-bold'
          onClick={onConnectButtonPress}
          title={t('conversation.stopConversationAriaLabel')}
        >
          <X
            width={18}
            height={18}
            className='shrink-0'
          />
          <span className='truncate'>{t('conversation.stopConversation')}</span>
        </button>
      );
    }
    if (isHistoryMode) {
      return (
        <button
          aria-label={t('conversation.backAriaLabel')}
          className='min-w-0 shrink mr-auto h-11 px-4 cursor-pointer bg-surface border border-hairline-2 text-ink-2 hover:bg-paper transition-colors rounded-2xl flex flex-row items-center justify-center gap-2 text-sm'
          onClick={onBack}
          title={t('common.back')}
        >
          <ArrowLeft
            width={20}
            height={20}
            className='shrink-0'
          />
          <span className='truncate'>{t('common.back')}</span>
        </button>
      );
    }
    return (
      <div className='flex items-center gap-2 mr-auto'>
        {isMobile ? (
          <EmergencyButton labeled />
        ) : (
          <BrandLogos className='h-8' />
        )}
      </div>
    );
  };

  const renderFocusedMobileFooter = () => {
    if (isWriteExpanded) {
      return (
        <div className='flex gap-2 pb-1 items-end'>
          <textarea
            ref={textareaRef}
            className='flex-1 p-2.5 bg-surface-2 border-2 border-hairline-2 rounded-sm text-ink placeholder-muted resize-none focus:outline-none focus:ring-2 focus:ring-blue focus:border-blue text-sm max-h-[96px] overflow-y-auto'
            placeholder={t('conversation.typeMessagePlaceholder')}
            rows={1}
            value={textInput}
            onChange={onChangeTextInput}
            onKeyDown={onTextInputKeyDown}
          />
          <button
            className='px-3 py-2 bg-blue-tint border-2 border-blue text-blue-600 rounded-md hover:bg-blue-tint-2 transition-colors disabled:opacity-50 text-sm font-bold min-w-[56px] min-h-[44px]'
            onClick={() => {
              triggerHapticFeedback();
              onSendMessage();
            }}
            disabled={!textInput.trim()}
          >
            {t('conversation.sendMessage')}
          </button>
        </div>
      );
    }

    return (
      <div className='flex gap-2 pb-1'>
        <button
          data-scan-item
          className='flex-1 min-h-[44px] flex items-center justify-center gap-2 px-3 bg-surface border-2 border-hairline-2 rounded-md text-sm font-bold text-ink-2'
          onClick={() => setIsQuickPhrasesOpen(true)}
        >
          <List size={16} />
          {t('conversation.quickPhrases')}
        </button>
        <button
          data-scan-item
          className='min-h-[44px] flex items-center justify-center gap-2 px-4 bg-blue-tint border-2 border-blue text-blue-600 rounded-md text-sm font-bold'
          onClick={() => {
            setIsWriteExpanded(true);
            setTimeout(() => textareaRef.current?.focus(), 0);
          }}
        >
          <Keyboard size={16} />
          {t('conversation.writeMessage')}
        </button>
      </div>
    );
  };

  const renderStandardFooter = () => (
    <Fragment>
      {!isHistoryMode && quickPhrases.length > 0 && (
        <div className='mb-2 landscape:hidden'>
          <QuickPhrases
            phrases={quickPhrases}
            onSelect={onQuickPhraseSelect}
            compact
          />
        </div>
      )}

      {isDirectiveOpen && (
        <div className='flex flex-row gap-2 mb-2'>
          <input
            className='grow px-4 py-3 text-sm text-ink bg-surface-2 border border-hairline-2 rounded-2xl focus:outline-none focus:border-blue'
            placeholder={t('conversation.aiPilotPlaceholder')}
            value={directiveInput}
            onChange={(e) => onDirectiveInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                onDirectiveSubmit();
                setIsDirectiveOpen(false);
              }
            }}
            ref={directiveInputRef}
          />
          <button
            onClick={() => {
              onDirectiveSubmit();
              setIsDirectiveOpen(false);
            }}
            className='px-4 py-3 text-sm font-bold text-ink-2 bg-surface border border-hairline-2 rounded-2xl hover:bg-paper disabled:opacity-50 transition-colors focus:outline-none focus:border-blue cursor-pointer'
            disabled={!directiveInput.trim()}
          >
            {t('conversation.aiPilotButton')}
          </button>
        </div>
      )}

      {shouldConnect && !isHistoryMode && !isMobile && (
        <div className='flex flex-row gap-2 mb-2'>
          <button
            data-scan-item
            onClick={() => onResponseSelect(staticContextOption.id)}
            className='flex-1 min-h-[40px] px-3 py-2 text-xs leading-tight italic text-ink-2 bg-surface-2 border border-dashed border-hairline-2 rounded-2xl hover:border-hairline focus:outline-none focus:ring-2 focus:ring-blue focus:ring-opacity-50 transition-all text-left'
          >
            {staticContextOption.text}
          </button>
          <button
            data-scan-item
            onClick={() => onResponseSelect(staticRepeatOption.id)}
            className='flex-1 min-h-[40px] px-3 py-2 text-xs leading-tight italic text-ink-2 bg-surface-2 border border-dashed border-hairline-2 rounded-2xl hover:border-hairline focus:outline-none focus:ring-2 focus:ring-blue focus:ring-opacity-50 transition-all text-left'
          >
            {staticRepeatOption.text}
          </button>
        </div>
      )}

      <div className='flex gap-2 pb-1 items-end'>
        {shouldConnect && !isHistoryMode && isMobile && (
          <button
            className='shrink-0 h-11 w-11 flex items-center justify-center bg-surface border border-hairline-2 rounded-lg text-ink-2 hover:bg-paper transition-colors'
            onClick={() => setIsDrawerOpen((v) => !v)}
            aria-label={t('conversation.keywords')}
            title={t('conversation.keywords')}
          >
            {isDrawerOpen ? <X size={20} /> : <Compass size={20} />}
          </button>
        )}
        <textarea
          ref={textareaRef}
          className='flex-1 p-2 bg-surface-2 border border-hairline-2 rounded-lg text-ink placeholder-muted resize-none focus:outline-none focus:ring-2 focus:ring-blue focus:border-blue text-sm max-h-[96px] overflow-y-auto'
          placeholder={t('conversation.typeMessagePlaceholder')}
          rows={1}
          value={textInput}
          onChange={onChangeTextInput}
          onKeyDown={onTextInputKeyDown}
        />
        <button
          className='px-3 py-2 bg-blue text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 text-sm min-w-[56px] min-h-[44px]'
          onClick={() => {
            triggerHapticFeedback();
            onSendMessage();
          }}
          disabled={!textInput.trim()}
        >
          {t('conversation.sendMessage')}
        </button>
      </div>
    </Fragment>
  );

  return (
    <div
      className='w-full flex flex-col bg-paper text-ink overflow-hidden'
      style={{
        height: `${vh}px`,
        paddingBottom: keyboardHeight > 0 ? `${keyboardHeight}px` : undefined,
        // In landscape the Android navigation bar sits on a side edge and
        // overlapped the response cards / send button without these.
        paddingLeft: 'var(--safe-area-inset-left)',
        paddingRight: 'var(--safe-area-inset-right)',
      }}
    >
      {/* Safe area spacer */}
      <div
        style={{ height: 'var(--safe-area-inset-top)' }}
        className='shrink-0'
      />
      <ErrorMessages
        errors={errors}
        setErrors={setErrors}
      />

      {/* === Header === */}
      <div className='flex items-center gap-2 px-4 py-3 shrink-0 h-[60px] landscape:h-[44px]'>
        {renderHeaderLeft()}

        <div className='flex flex-row items-center gap-2 min-w-0 shrink'>
          {shouldConnect && !isHistoryMode && (
            <button
              onClick={onToggleInitiating}
              data-scan-item
              aria-label={t('conversation.takeFloor')}
              title={t('conversation.takeFloorHint')}
              className={cn(
                'shrink-0 size-11 rounded-sm text-xs font-medium border transition-colors flex items-center justify-center',
                isInitiating
                  ? 'bg-sage text-white border-sage'
                  : 'bg-surface text-ink-2 border-hairline-2',
                !isMobile && 'min-w-0 h-11 px-3 flex-row gap-2',
              )}
            >
              <Megaphone
                width={18}
                height={18}
                className='shrink-0'
              />
              {!isMobile && (
                <span className='truncate'>{t('conversation.takeFloor')}</span>
              )}
            </button>
          )}
          {/* SOS: compact in session/history; labelled variant lives in the idle header left */}
          {!showIdle && <EmergencyButton compact />}
          {/* Settings: hidden during an active session on mobile (wireframe 2a) */}
          {(!shouldConnect || !isMobile) && (
            <button
              className='shrink-0 size-11 cursor-pointer bg-surface border border-hairline-2 hover:bg-paper transition-colors shadow-[var(--sh-sm)] rounded-sm flex items-center justify-center text-ink-2'
              onClick={onSettingsOpen}
              title={t('settings.changeSettings')}
            >
              <Settings size={20} />
            </button>
          )}
        </div>
      </div>

      {/* Settings-locked toast (mobile) */}
      {settingsBlockedMessage && (
        <div
          role='status'
          className='fixed left-4 right-4 z-50 px-4 py-3 text-sm text-center border rounded-2xl text-ink bg-surface border-hairline-2 shadow-[var(--sh-md)] lg:left-1/4 lg:right-1/4'
          style={{ top: 'calc(4.75rem + var(--safe-area-inset-top))' }}
        >
          {settingsBlockedMessage}
        </div>
      )}

      {/* === Body === */}
      <div className='flex-1 min-h-0 flex flex-row lg:gap-0'>
        {/* History sidebar — persistent on desktop, tab on mobile */}
        {!isMobile && (
          <ConversationHistory
            conversations={userData?.conversations ?? []}
            selectedConversationIndex={selectedConversationIndex}
            onConversationSelect={onConversationSelect}
            onNewConversation={onNewConversation}
            onDeleteConversation={onDeleteConversation}
            onArchiveConversation={onArchiveConversation}
          />
        )}

        {showIdle ? (
          renderIdleContent()
        ) : (
          <Fragment>
            {/* Main: chat + responses (split) or tabs */}
            {isSplitView ? (
              <div
                className={cn(
                  'flex-1 min-h-0 flex flex-col',
                  !isFocusedMobileSession && 'landscape:flex-row',
                )}
              >
                {/* Message bubbles fill the top in every layout; during a
                    focused mobile session the suggestions sit below them as
                    full-width stacked rows. */}
                <div
                  className={cn(
                    'flex flex-col flex-1 min-h-0',
                    !isFocusedMobileSession && 'landscape:basis-1/2',
                  )}
                >
                  <ChatPanel
                    chatHistory={chatHistory}
                    isConnected={shouldConnect}
                    currentSpeakerMessage={currentSpeakerMessage}
                  />
                </div>
                <div
                  className={cn(
                    'flex flex-col min-h-0 border-t border-hairline',
                    isFocusedMobileSession
                      ? 'shrink-0 h-[42%] min-h-[236px]'
                      : 'shrink-0 h-[42%] min-h-[190px] landscape:h-auto landscape:flex-1 landscape:basis-1/2 landscape:border-t-0 landscape:border-l',
                  )}
                >
                  <ResponsePanel
                    frozenResponses={frozenResponses}
                    pendingResponses={pendingResponses}
                    onResponseEdit={onResponseEdit}
                    onResponseSelect={onResponseSelect}
                    onEditResponseInChat={handleEditResponse}
                    large
                  />
                </div>
              </div>
            ) : (
              <div className='flex-1 min-h-0 flex flex-col'>
                {/* History list from idle: no tabs (wireframe 2a) */}
                {!isHistoryListOnly && (
                  <div className='flex border-b border-hairline shrink-0'>
                    <button
                      className={cn(
                        'flex-1 py-3 landscape:py-1 min-h-[44px] text-sm font-medium transition-colors',
                        activePanel === 'chat'
                          ? 'text-blue-600 border-b-2 border-blue'
                          : 'text-muted hover:text-ink',
                      )}
                      onClick={() => setActivePanel('chat')}
                    >
                      {t('conversation.chat')}
                    </button>
                    <button
                      className={cn(
                        'flex-1 py-3 landscape:py-1 min-h-[44px] text-sm font-medium transition-colors',
                        activePanel === 'history'
                          ? 'text-blue-600 border-b-2 border-blue'
                          : 'text-muted hover:text-ink',
                      )}
                      onClick={() => setActivePanel('history')}
                    >
                      {t('conversation.history')}
                    </button>
                  </div>
                )}
                <div
                  className={cn(
                    activePanel === 'chat' && !isHistoryListOnly
                      ? 'flex flex-col flex-1 min-h-0'
                      : 'hidden',
                  )}
                >
                  <ChatPanel
                    chatHistory={chatHistory}
                    isConnected={shouldConnect}
                    currentSpeakerMessage={currentSpeakerMessage}
                    pastConversation={pastConversation}
                    isViewingPastConversation={isViewingPastConversation}
                  />
                </div>
                <div
                  className={cn(
                    activePanel === 'history' || isHistoryListOnly
                      ? 'flex flex-col flex-1 min-h-0'
                      : 'hidden',
                  )}
                >
                  <HistoryPanel
                    conversations={userData?.conversations ?? []}
                    selectedConversationIndex={selectedConversationIndex}
                    onConversationSelect={onConversationSelect}
                    onNewConversation={onNewConversation}
                    onDeleteConversation={onDeleteConversation}
                    onArchiveConversation={onArchiveConversation}
                  />
                </div>
              </div>
            )}

            {/* Accessories drawer: pinned on desktop, overlay on mobile */}
            {shouldConnect && !isHistoryMode && (
              <AccessoriesDrawer
                open={isDrawerOpen || !isMobile}
                onClose={() => setIsDrawerOpen(false)}
                additionalKeywords={
                  userData?.user_settings?.additional_keywords ?? []
                }
                friends={userData?.user_settings?.friends ?? []}
                quickPhrases={userData?.user_settings?.quick_phrases ?? []}
                appointments={userData?.user_settings?.appointments ?? []}
                voiceName={userData?.user_settings?.voice}
                lang={userData?.user_settings?.expected_transcription_language}
                pendingKeywords={pendingKeywords}
                userDataError={userDataError}
                settingsBlockedMessage={settingsBlockedMessage}
                onWordBubbleClick={onWordBubbleClick}
                onKeywordSelect={onKeywordSelect}
                onIntentClick={onIntentClick}
                onQuickPhraseSelect={onQuickPhraseSelect}
              />
            )}
          </Fragment>
        )}
      </div>

      {/* === Footer: ribbon (mobile session) or full input === */}
      {!showIdle && !isHistoryListOnly && (
        <div className='px-3 pt-2 pb-1 landscape:pt-1 landscape:pb-0 border-t border-hairline shrink-0'>
          {isFocusedMobileSession
            ? renderFocusedMobileFooter()
            : renderStandardFooter()}
        </div>
      )}

      {isQuickPhrasesOpen && (
        <QuickPhrasesSheet
          phrases={quickPhrases}
          onSelect={onQuickPhraseSelect}
          onClose={() => setIsQuickPhrasesOpen(false)}
          onEdit={onSettingsOpen}
        />
      )}

      {/* Safe area spacer */}
      <div
        style={{ height: 'var(--safe-area-inset-bottom)' }}
        className='shrink-0'
      />

      {/* Dev mode debug */}
      {isDevMode && (
        <div className='p-4 overflow-auto border-t border-hairline max-h-64'>
          <div className='text-xs'>
            <pre
              className='wrap-break-word whitespace-pre-wrap'
              // eslint-disable-next-line react/no-danger
              dangerouslySetInnerHTML={{
                __html: prettyPrintJson.toHtml(debugDict),
              }}
            />
          </div>
        </div>
      )}

      {/* Settings modal */}
      {isSettingsOpen && userData && (
        <div className='fixed inset-0 z-50 flex items-center justify-center p-4 lg:px-14 lg:py-8 bg-ink/40 backdrop-blur-sm lg:backdrop-blur-2xl'>
          <div
            role='dialog'
            aria-modal='true'
            aria-label={t('settings.title')}
            className='w-full h-full max-w-md max-h-full flex flex-col overflow-hidden border bg-surface border-hairline shadow-[var(--sh-lg)] rounded-3xl lg:max-w-7xl lg:rounded-xl lg:shadow-custom lg:px-12 lg:pt-6 lg:pb-8'
          >
            {isMobile ? (
              <MobileSettingsPopup
                userSettings={userData.user_settings}
                email={userData.email}
                isAdmin={Boolean(userData.is_admin)}
                onSave={onSettingsSave}
                onCancel={onSettingsCancel}
              />
            ) : (
              <SettingsPopup
                userSettings={userData.user_settings}
                email={userData.email}
                isAdmin={Boolean(userData.is_admin)}
                onSave={onSettingsSave}
                onCancel={onSettingsCancel}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ConversationLayout;
