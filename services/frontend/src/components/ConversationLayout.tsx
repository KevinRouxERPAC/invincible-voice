'use client';

import {
  ArrowLeft,
  Compass,
  Megaphone,
  Pause,
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
import ResponsePanel from '@/components/mobile/ResponsePanel';
import MobileSettingsPopup from '@/components/settings/MobileSettingsPopup';
import SettingsPopup from '@/components/settings/SettingsPopup';
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
  const [activePanel, setActivePanel] = useState<ActivePanel>(
    isShowingHistoryFromIdle && !isViewingPastConversation ? 'history' : 'chat',
  );
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const directiveInputRef = useRef<HTMLInputElement>(null);

  const staticContextOption = getStaticContextOption(t);
  const staticRepeatOption = getStaticRepeatOption(t);

  const isHistoryMode = isShowingHistoryFromIdle || isViewingPastConversation;
  const isSplitView = shouldConnect && !isHistoryMode;

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
      setActivePanel('chat');
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

  const pastConversation =
    selectedConversationIndex !== null &&
    userData?.conversations[selectedConversationIndex]
      ? userData.conversations[selectedConversationIndex]
      : undefined;

  // --- Idle: no session, no history browsing ---
  const showIdle =
    !shouldConnect && !isViewingPastConversation && !isShowingHistoryFromIdle;

  const renderHeaderLeft = () => {
    if (shouldConnect) {
      return (
        <button
          aria-label={t('conversation.stopConversationAriaLabel')}
          className='min-w-0 shrink mr-auto h-11 px-4 cursor-pointer bg-terra-tint border border-terra text-terra rounded-2xl flex flex-row items-center justify-center gap-2 text-sm'
          onClick={onConnectButtonPress}
          title={t('conversation.stopConversationAriaLabel')}
        >
          <Pause
            width={24}
            height={24}
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
        <img
          src='/logo_invincible.png'
          alt='InvincibleVoice'
          className='logo-themed h-8'
        />
      </div>
    );
  };

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
                'min-w-0 shrink h-11 px-3 rounded-2xl text-xs font-medium border transition-colors flex flex-row items-center justify-center gap-2',
                isInitiating
                  ? 'bg-sage text-white border-sage'
                  : 'bg-surface text-ink-2 border-hairline-2',
              )}
            >
              <Megaphone
                width={18}
                height={18}
                className='shrink-0'
              />
              <span className='truncate lg:hidden'>
                {t('conversation.takeFloor')}
              </span>
            </button>
          )}
          <EmergencyButton compact />
          <button
            className='shrink-0 h-11 px-3 cursor-pointer bg-surface border border-hairline-2 hover:bg-paper transition-colors shadow-[var(--sh-sm)] rounded-2xl flex flex-row items-center justify-center text-ink-2'
            onClick={onSettingsOpen}
            title={t('settings.changeSettings')}
          >
            <Settings size={20} />
          </button>
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
          />
        )}

        {showIdle ? (
          <div className='flex-1 flex flex-col items-center justify-center gap-4'>
            <button
              onClick={onConnectButtonPress}
              className='px-8 py-4 bg-blue text-white rounded-2xl text-lg font-medium hover:bg-blue-600 transition-colors'
            >
              {t('conversation.startChatting')}
            </button>
            {isMobile && (userData?.conversations ?? []).length > 0 && (
              <button
                className='flex items-center gap-2 px-6 min-h-[44px] bg-surface border border-hairline-2 rounded-2xl text-sm text-ink-2 hover:bg-paper transition-colors'
                onClick={onShowHistoryFromIdle}
              >
                {t('conversation.history')}
              </button>
            )}
            {/* Native app uses the phone's own STT/TTS, not Gradium — only
                credit Gradium on the web build that actually uses it. */}
            {!isNativeApp() && (
              <p className='text-xs text-muted text-center'>
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
        ) : (
          <Fragment>
            {/* Main: chat + responses (split) or tabs */}
            {isSplitView ? (
              <div className='flex-1 min-h-0 flex flex-col landscape:flex-row'>
                <div className='flex flex-col flex-1 min-h-0 landscape:basis-1/2'>
                  <ChatPanel
                    chatHistory={chatHistory}
                    isConnected={shouldConnect}
                    currentSpeakerMessage={currentSpeakerMessage}
                  />
                </div>
                {/* landscape:basis-1/2 matters: the chat column keeps flex-1
                    (grow) + basis-1/2, so without a matching basis here the
                    responses column started from 0% and ended up at ~25% —
                    cards wrapped one character per line. */}
                <div className='flex flex-col shrink-0 h-[42%] min-h-[190px] border-t border-hairline landscape:h-auto landscape:min-h-0 landscape:flex-1 landscape:basis-1/2 landscape:border-t-0 landscape:border-l'>
                  <ResponsePanel
                    frozenResponses={frozenResponses}
                    pendingResponses={pendingResponses}
                    onResponseEdit={onResponseEdit}
                    onResponseSelect={onResponseSelect}
                    onEditResponseInChat={handleEditResponse}
                  />
                </div>
              </div>
            ) : (
              <div className='flex-1 min-h-0 flex flex-col'>
                {/* Tabs: chat / history (mobile + desktop when browsing history) */}
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
                <div
                  className={cn(
                    activePanel === 'chat'
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
                    activePanel === 'history'
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

      {/* === Footer: textarea + send === */}
      {!showIdle && (
        <div className='px-4 pt-2 pb-1 landscape:pt-1 landscape:pb-0 border-t border-hairline shrink-0'>
          {/* Quick phrases (mobile only) */}
          {!isHistoryMode &&
            (userData?.user_settings?.quick_phrases ?? []).length > 0 && (
              <div className='mb-2 landscape:hidden'>
                <QuickPhrases
                  phrases={userData?.user_settings?.quick_phrases ?? []}
                  onSelect={onQuickPhraseSelect}
                  compact
                />
              </div>
            )}

          {/* Directive popover */}
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

          {/* Compact quick questions */}
          {shouldConnect && !isHistoryMode && (
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

          {/* Textarea + actions */}
          <div className='flex gap-2 pb-1 items-end'>
            {/* Drawer toggle (mobile only — on desktop the drawer is pinned) */}
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
              onClick={onSendMessage}
              disabled={!textInput.trim()}
            >
              {t('conversation.sendMessage')}
            </button>
          </div>
        </div>
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
            className='w-full h-full max-w-md max-h-full p-4 overflow-y-auto border bg-surface border-hairline shadow-[var(--sh-lg)] rounded-3xl lg:max-w-7xl lg:rounded-[40px] lg:shadow-custom lg:px-12 lg:pt-6 lg:pb-8'
          >
            {isMobile ? (
              <MobileSettingsPopup
                userSettings={userData.user_settings}
                email={userData.email}
                onSave={onSettingsSave}
                onCancel={onSettingsCancel}
              />
            ) : (
              <SettingsPopup
                userSettings={userData.user_settings}
                email={userData.email}
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
