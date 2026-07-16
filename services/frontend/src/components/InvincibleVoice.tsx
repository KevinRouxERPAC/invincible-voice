'use client';

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import useWebSocket, { ReadyState } from 'react-use-websocket';
import { addAuthHeaders, getBearerToken } from '@/auth/authUtils';
import ConversationLayout from '@/components/ConversationLayout';
import ModelDownloadScreen from '@/components/ModelDownloadScreen';
import OfflineFallback from '@/components/OfflineFallback';
import type { PendingResponse } from '@/components/chat/ChatInterface';
import ConfirmationDialog from '@/components/conversations/ConfirmationDialog';
import { type ErrorItem, makeErrorItem } from '@/components/ui/ErrorMessages';
import {
  NB_KEYWORDS,
  NB_RESPONSES,
  RESPONSES_SIZES,
  type ResponseSize,
} from '@/constants';
import { useAudioProcessor } from '@/hooks/useAudioProcessor';
import { useBackendServerUrl } from '@/hooks/useBackendServerUrl';
import { useLocalConversation } from '@/hooks/useLocalConversation';
import { useMicrophoneAccess } from '@/hooks/useMicrophoneAccess';
import { useMobileDetection } from '@/hooks/useMobileDetection';
import useWakeLock from '@/hooks/useWakeLock';
import { useTranslations } from '@/i18n';
import type { ChatMessage } from '@/types/chatHistory';
import {
  hasInternetConnectivity,
  type HealthStatus,
  shouldUseLocalFallback,
} from '@/types/health';
import { base64EncodeOpus } from '@/utils/audioUtil';
import { apiUrl } from '@/utils/backend';
import { convertConversationToChat } from '@/utils/conversationUtils';
import { getLocalLlm } from '@/utils/localLlm';
import { isLocalMode, isLocalOnlyMode } from '@/utils/localMode';
import { saveSettingsSnapshot } from '@/utils/localSettingsCache';
import { ensureLocalModelReady, type ModelState } from '@/utils/modelManager';
import {
  isNativeSpeechAvailable,
  requestNativeSpeechPermission,
  startNativeListening,
  toBcp47,
  type NativeListeningController,
} from '@/utils/nativeSpeech';
import { playQuickPhrase, prefetchQuickPhrases } from '@/utils/phraseAudio';
import { isNativeApp } from '@/utils/platform';
import { calculateTotalTokens, formatTokenCount } from '@/utils/tokenUtils';
import { ttsCache } from '@/utils/ttsCache';
import { playTTSStream } from '@/utils/ttsUtil';
import { getUiSettings } from '@/utils/uiSettings';
import {
  deleteConversation,
  getUserData,
  setConversationArchived,
  type UserData,
  type UserSettings,
} from '@/utils/userData';

interface PendingKeyword {
  id: string;
  text: string;
  isComplete: boolean;
}

const InvincibleVoice = () => {
  const t = useTranslations();
  const [uiSettings, setUiSettingsState] = useState(() => getUiSettings());

  useEffect(() => {
    const handleUiSettingsChanged = () => {
      setUiSettingsState(getUiSettings());
    };
    window.addEventListener('ui-settings-changed', handleUiSettingsChanged);
    return () => {
      window.removeEventListener(
        'ui-settings-changed',
        handleUiSettingsChanged,
      );
    };
  }, []);

  const isMobile = useMobileDetection();
  const { microphoneAccess, askMicrophoneAccess } = useMicrophoneAccess();
  const [userData, setUserData] = useState<UserData | null>(null);
  const [userDataError, setUserDataError] = useState<string | null>(null);
  const [debugDict, setDebugDict] = useState<object | null>(null);
  const [rawChatHistory, setRawChatHistory] = useState<ChatMessage[]>([]);
  const [pendingResponses, setPendingResponses] = useState<PendingResponse[]>(
    [],
  );
  const [responseTimelines, setResponseTimelines] = useState<number[]>(
    Array(NB_RESPONSES).fill(0),
  );
  const [pendingKeywords, setPendingKeywords] = useState<PendingKeyword[]>([]);
  const [keywordTimelines, setKeywordTimelines] = useState<number[]>(
    Array(NB_KEYWORDS).fill(0),
  );
  const [lastProcessedMessageId, setLastProcessedMessageId] = useState<
    string | null
  >(null);
  const [currentSpeakerMessage, setCurrentSpeakerMessage] =
    useState<string>('');
  const [currentSpeakerMessageStartTime, setCurrentSpeakerMessageStartTime] =
    useState<number | null>(null);
  // Native STT only: utterances already finished (and sent to the backend)
  // but not yet flushed to the chat history. Partial results are displayed
  // appended to this text.
  const nativeCommittedTextRef = useRef<string>('');
  const [textInput, setTextInput] = useState<string>('');
  const [directiveInput, setDirectiveInput] = useState<string>('');
  const [lastSentKeywords, setLastSentKeywords] = useState<string | null>(null);
  const [lastSentText, setLastSentText] = useState<string>('');
  const textInputTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [settingsBlockedMessage, setSettingsBlockedMessage] = useState<
    string | null
  >(null);
  const [selectedConversationIndex, setSelectedConversationIndex] = useState<
    number | null
  >(null);
  const [isViewingPastConversation, setIsViewingPastConversation] =
    useState<boolean>(false);
  const [isShowingHistoryFromIdle, setIsShowingHistoryFromIdle] =
    useState<boolean>(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState<boolean>(false);
  const [conversationToDelete, setConversationToDelete] = useState<
    number | null
  >(null);
  const [frozenResponses, setFrozenResponses] = useState<
    PendingResponse[] | null
  >(null);
  const [, setResponseSize] = useState<ResponseSize>(RESPONSES_SIZES.M);
  const [shouldConnect, setShouldConnect] = useState(false);
  // "Take the floor" mode: ask the backend for openers instead of replies.
  const [isInitiating, setIsInitiating] = useState(false);
  const backendServerUrl = useBackendServerUrl();
  const [healthStatus, setHealthStatus] = useState<HealthStatus | null>(null);
  // Progress of the one-time on-device model download (native app only).
  const [modelState, setModelState] = useState<ModelState>({
    status: 'absent',
  });
  const [errors, setErrors] = useState<ErrorItem[]>([]);
  const bearerToken = useMemo(() => getBearerToken(), []);

  const newConversationUrl = useMemo(() => {
    // Create timezone-aware datetime for local_time parameter
    const localTime = new Date().toISOString();
    const encodedLocalTime = encodeURIComponent(localTime);
    // Whenever this conversation WebSocket actually opens, the app is online and
    // streams microphone audio, so the backend runs its own (Gradium) STT.
    // Offline, the native app uses the on-device conversation instead of this
    // socket, so `client_stt` is no longer needed here.
    return `${backendServerUrl.toString()}/v1/user/new-conversation?local_time=${encodedLocalTime}`;
  }, [backendServerUrl]);
  const handleInComingMessage = useCallback(
    (lastMessage: WebSocketEventMap['message']) => {
      if (lastMessage === null) {
        return;
      }

      const data = JSON.parse(lastMessage.data);

      // Prevent processing the same message multiple times
      if (data.event_id && data.event_id === lastProcessedMessageId) {
        return;
      }
      if (data.event_id) {
        setLastProcessedMessageId(data.event_id);
      }

      if (data.type === 'unmute.additional_outputs') {
        setDebugDict(data.args.debug_dict);
      } else if (data.type === 'error') {
        if (data.error.type === 'warning') {
          console.warn(`Warning from server: ${data.error.message}`, data);
        } else {
          console.error(`Error from server: ${data.error.message}`, data);
          setErrors((prev) => [...prev, makeErrorItem(data.error.message)]);
        }
      } else if (
        data.type === 'conversation.item.input_audio_transcription.delta'
      ) {
        // Real-time transcription of speaker
        setCurrentSpeakerMessage((prev) => {
          const newMessage = prev + (prev.length > 0 ? ' ' : '') + data.delta;
          // Set start time when first transcription arrives
          if (prev.length === 0) {
            setCurrentSpeakerMessageStartTime(Date.now());
          }
          return newMessage;
        });
      } else if (data.type === 'one.response') {
        // Progressive response handling - responses come one at a time
        // Only update if this response is newer than what we have
        // Convert ISO string timestamp to number for comparison
        const responseTimestamp = new Date(data.timestamp).getTime();
        if (responseTimestamp >= responseTimelines[data.index]) {
          // Add speaker message to history on first response if not already added
          if (
            data.index === 0 &&
            currentSpeakerMessage.trim() &&
            pendingResponses.length === 0
          ) {
            setRawChatHistory((prev) => [
              ...prev,
              {
                role: 'user',
                content: currentSpeakerMessage,
                timestamp: currentSpeakerMessageStartTime || Date.now(),
              },
            ]);
            setCurrentSpeakerMessage('');
            setCurrentSpeakerMessageStartTime(null);
            nativeCommittedTextRef.current = '';
          }

          setResponseTimelines((prev) => {
            const newTimelines = [...prev];
            newTimelines[data.index] = responseTimestamp;
            return newTimelines;
          });

          const responseMessageId = crypto.randomUUID();
          setPendingResponses((prev) => {
            const newResponses = [...prev];
            // Ensure we have at least index + 1 responses
            while (newResponses.length <= data.index) {
              newResponses.push({
                id: `response-${newResponses.length}`,
                text: '',
                isComplete: false,
                messageId: crypto.randomUUID(),
              });
            }
            newResponses[data.index] = {
              id: `response-${data.index}`,
              text: data.content,
              isComplete: true,
              messageId: responseMessageId,
            };
            return newResponses;
          });
        }
      } else if (data.type === 'one.keyword') {
        // Progressive keyword handling - keywords come one at a time
        // Only update if this keyword is newer than what we have
        // Convert ISO string timestamp to number for comparison
        const keywordTimestamp = new Date(data.timestamp).getTime();
        if (keywordTimestamp >= keywordTimelines[data.index]) {
          setKeywordTimelines((prev) => {
            const newTimelines = [...prev];
            newTimelines[data.index] = keywordTimestamp;
            return newTimelines;
          });
          setPendingKeywords((prev) => {
            const newKeywords = [...prev];
            // Ensure we have at least index + 1 keywords
            while (newKeywords.length <= data.index) {
              newKeywords.push({
                id: `keyword-${newKeywords.length}`,
                text: '',
                isComplete: false,
              });
            }
            newKeywords[data.index] = {
              id: `keyword-${data.index}`,
              text: data.content,
              isComplete: true,
            };
            return newKeywords;
          });
        }
      } else if (
        ![
          'input_audio_buffer.speech_stopped',
          'input_audio_buffer.speech_started',
          'unmute.interrupted_by_vad',
          'unmute.response.text.delta.ready',
          'unmute.response.audio.delta.ready',
        ].includes(data.type)
      ) {
        console.warn('Received unknown message:', data);
      }
    },
    [
      currentSpeakerMessage,
      currentSpeakerMessageStartTime,
      keywordTimelines,
      lastProcessedMessageId,
      pendingResponses.length,
      responseTimelines,
    ],
  );
  // Hybrid mode (native app): use the cloud backend for suggestions when it is
  // reachable (much better quality), and fall back to the on-device model when
  // offline. Until the first health check resolves we default to local so the
  // app works offline out of the box.
  const localCapable = isLocalMode();
  const preferLocal = shouldUseLocalFallback(localCapable, healthStatus);
  // Voice (STT + TTS) follows the very same offline signal as the LLM: online
  // the native app streams to the backend (Gradium) like the web; only when the
  // backend is unreachable does it fall back to the phone's own speech engines.
  // So voice and suggestions always come from the same place.
  const useNativeVoice = isNativeApp() && preferLocal;
  // When on-device: suggestions are produced locally, so the conversation
  // WebSocket to the backend is never opened. This local hook mimics
  // useWebSocket's interface and feeds one.response / one.keyword events into
  // the very same handler, so nothing downstream changes.
  const localConversation = useLocalConversation({
    enabled: preferLocal,
    connected: shouldConnect,
    userData,
    onMessage: handleInComingMessage,
  });
  const ws = useWebSocket(
    newConversationUrl,
    {
      protocols: bearerToken
        ? ['realtime', `Bearer.${bearerToken}`]
        : ['realtime'],
      onMessage: handleInComingMessage,
      onOpen: () => console.warn('[ws] OPEN', newConversationUrl),
      onClose: (e) =>
        console.warn(
          `[ws] CLOSE code=${(e as CloseEvent).code} reason=${
            (e as CloseEvent).reason
          } wasClean=${(e as CloseEvent).wasClean}`,
        ),
      onError: (e) => console.error('[ws] ERROR', String(e)),
    },
    shouldConnect && !preferLocal,
  );
  const sendMessage = preferLocal
    ? localConversation.sendMessage
    : ws.sendMessage;
  const readyState = preferLocal ? localConversation.readyState : ws.readyState;
  const clearResponses = useCallback(() => {
    setPendingResponses([]);
    setResponseTimelines(Array(NB_RESPONSES).fill(0));
    setPendingKeywords([]);
    setKeywordTimelines(Array(NB_KEYWORDS).fill(0));
    setCurrentSpeakerMessageStartTime(null);
  }, []);
  const unfreezeResponses = useCallback(() => {
    setFrozenResponses(null);
  }, []);
  const onOpusRecorded = useCallback(
    (opus: Uint8Array) => {
      sendMessage(
        JSON.stringify({
          type: 'input_audio_buffer.append',
          audio: base64EncodeOpus(opus),
        }),
      );
    },
    [sendMessage],
  );
  const { setupAudio, shutdownAudio } = useAudioProcessor(onOpusRecorded);
  const expectedTranscriptionLanguage =
    userData?.user_settings?.expected_transcription_language ?? null;
  // Native app, offline only: the phone does the speech recognition. Show
  // partial results live and send each finished utterance to the on-device
  // conversation, which runs the LLM suggestions on it (no audio leaves the
  // device). Online, the mic audio is streamed to the backend instead (Gradium
  // STT), so this native listening must stay off.
  useEffect(() => {
    if (!isNativeApp() || !preferLocal || readyState !== ReadyState.OPEN) {
      return undefined;
    }

    let controller: NativeListeningController | null = null;
    let cancelled = false;

    startNativeListening({
      language: toBcp47(expectedTranscriptionLanguage),
      onPartial: (text) => {
        setCurrentSpeakerMessage((prev) => {
          if (prev.length === 0) {
            setCurrentSpeakerMessageStartTime(Date.now());
          }
          const committed = nativeCommittedTextRef.current;
          return committed ? `${committed} ${text}` : text;
        });
      },
      onUtterance: (text) => {
        const committed = nativeCommittedTextRef.current;
        nativeCommittedTextRef.current = committed
          ? `${committed} ${text}`
          : text;
        setCurrentSpeakerMessage(nativeCommittedTextRef.current);
        sendMessage(
          JSON.stringify({
            type: 'speaker.text.append',
            text,
          }),
        );
      },
      onError: (error) => {
        console.error('Native speech recognition error:', error);
        const message = error instanceof Error ? error.message : String(error);
        const isNetworkProblem = message.toLowerCase().includes('network');
        const friendly = isNetworkProblem
          ? 'Speech recognition failed (offline). Assure you installed the offline language packs on Android, or use manual text input.'
          : message;
        setErrors((prev) => {
          // Avoid spamming the same error every time the recognizer fails.
          const alreadyShown = prev.some((e) =>
            e.message.includes('Speech recognition failed'),
          );
          if (alreadyShown) {
            return prev;
          }
          return [...prev, makeErrorItem(friendly)];
        });
      },
    })
      .then((c) => {
        if (cancelled) {
          c.stop().catch(() => {});
        } else {
          controller = c;
        }
      })
      .catch((error) => {
        console.error('Failed to start native speech recognition:', error);
        setErrors((prev) => [
          ...prev,
          makeErrorItem(t('errors.microphoneAccessNeeded')),
        ]);
      });

    return () => {
      cancelled = true;
      controller?.stop().catch(() => {});
    };
  }, [readyState, preferLocal, expectedTranscriptionLanguage, sendMessage, t]);
  const sendCurrentKeywords = useCallback(
    (keywords: string | null) => {
      if (keywords !== lastSentKeywords) {
        sendMessage(
          JSON.stringify({
            type: 'current.keywords',
            keywords,
          }),
        );
        setLastSentKeywords(keywords);
      }
    },
    [sendMessage, lastSentKeywords],
  );
  const handleSelectResponseSize = useCallback(
    (newSize: ResponseSize) => {
      setResponseSize(newSize);
      sendMessage(
        JSON.stringify({
          type: 'desired.responses.length',
          length: newSize,
        }),
      );
    },
    [sendMessage],
  );
  const sendInitiating = useCallback(
    (active: boolean, topic?: string) => {
      setIsInitiating(active);
      sendMessage(
        JSON.stringify({
          type: 'initiate.conversation',
          active,
          topic,
        }),
      );
    },
    [sendMessage],
  );
  const handleToggleInitiating = useCallback(() => {
    sendInitiating(
      !isInitiating,
      directiveInput.trim() ? directiveInput.trim() : undefined,
    );
  }, [isInitiating, sendInitiating, directiveInput]);

  const handleResponseSelection = useCallback(
    async (responseId: string) => {
      // After speaking, the backend leaves "take the floor" mode; mirror it here.
      setIsInitiating(false);
      if (
        responseId === 'static-context-question' ||
        responseId === 'static-repeat-question'
      ) {
        const staticText =
          responseId === 'static-context-question'
            ? t('conversation.contextQuestion')
            : t('conversation.repeatQuestion');
        const staticMessageId =
          responseId === 'static-context-question'
            ? '00000000-0000-4000-8000-000000000001'
            : '00000000-0000-4000-8000-000000000002';

        // Flush any pending speaker message to chat history first
        if (currentSpeakerMessage.trim()) {
          setRawChatHistory((prev) => [
            ...prev,
            {
              role: 'user',
              content: currentSpeakerMessage,
              timestamp: currentSpeakerMessageStartTime || Date.now(),
            },
          ]);
          setCurrentSpeakerMessage('');
          setCurrentSpeakerMessageStartTime(null);
        }

        setRawChatHistory((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: staticText,
            timestamp: Date.now(),
            messageId: staticMessageId,
          },
        ]);
        sendMessage(
          JSON.stringify({
            type: 'response.selected.by.writer',
            text: staticText,
            id: staticMessageId,
          }),
        );
        playTTSStream({
          text: staticText,
          cacheType: 'permanent', // Use permanent cache for static messages
          messageId: staticMessageId,
          useNativeVoice,
        }).catch(console.error);
      } else {
        const allResponses = frozenResponses || pendingResponses;
        const selectedResponse = allResponses.find((r) => r.id === responseId);
        if (!selectedResponse) {
          return;
        }

        // Flush any pending speaker message to chat history first
        if (currentSpeakerMessage.trim()) {
          setRawChatHistory((prev) => [
            ...prev,
            {
              role: 'user',
              content: currentSpeakerMessage,
              timestamp: currentSpeakerMessageStartTime || Date.now(),
            },
          ]);
          setCurrentSpeakerMessage('');
          setCurrentSpeakerMessageStartTime(null);
        }

        setRawChatHistory((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: selectedResponse.text,
            timestamp: Date.now(),
            messageId: selectedResponse.messageId,
          },
        ]);
        sendMessage(
          JSON.stringify({
            type: 'response.selected.by.writer',
            text: selectedResponse.text,
            id: selectedResponse.messageId,
          }),
        );
        playTTSStream({
          text: selectedResponse.text,
          cacheType: 'temporary',
          messageId: selectedResponse.messageId,
          useNativeVoice,
        }).catch(console.error);
      }
      if (!frozenResponses) {
        clearResponses();
      }
      setTextInput('');
      setLastSentText('');
      sendCurrentKeywords(null);

      if (textInputTimeoutRef.current) {
        clearTimeout(textInputTimeoutRef.current);
      }
    },
    [
      pendingResponses,
      frozenResponses,
      sendMessage,
      sendCurrentKeywords,
      clearResponses,
      currentSpeakerMessage,
      currentSpeakerMessageStartTime,
      useNativeVoice,
      t,
    ],
  );
  const handleQuickPhraseSelect = useCallback(
    (phraseText: string) => {
      const phraseMessageId = crypto.randomUUID();

      // Flush any pending speaker message to chat history first
      if (currentSpeakerMessage.trim()) {
        setRawChatHistory((prev) => [
          ...prev,
          {
            role: 'user',
            content: currentSpeakerMessage,
            timestamp: currentSpeakerMessageStartTime || Date.now(),
          },
        ]);
        setCurrentSpeakerMessage('');
        setCurrentSpeakerMessageStartTime(null);
      }

      setRawChatHistory((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: phraseText,
          timestamp: Date.now(),
          messageId: phraseMessageId,
        },
      ]);
      if (shouldConnect) {
        sendMessage(
          JSON.stringify({
            type: 'response.selected.by.writer',
            text: phraseText,
            id: phraseMessageId,
          }),
        );
      }
      playQuickPhrase({
        text: phraseText,
        voiceName: userData?.user_settings?.voice,
        lang:
          userData?.user_settings?.expected_transcription_language ?? undefined,
      }).catch(console.error);
    },
    [
      currentSpeakerMessage,
      currentSpeakerMessageStartTime,
      sendMessage,
      shouldConnect,
      userData?.user_settings?.voice,
      userData?.user_settings?.expected_transcription_language,
    ],
  );
  const handleWordBubbleClick = useCallback(
    (word: string) => {
      const newValue = textInput ? `${textInput} ${word}` : word;
      setTextInput(newValue);
      sendCurrentKeywords(newValue.trim());
      unfreezeResponses();
    },
    [textInput, sendCurrentKeywords, unfreezeResponses],
  );
  const handleKeywordSelect = useCallback(
    (keywordText: string) => {
      handleWordBubbleClick(keywordText);
    },
    [handleWordBubbleClick],
  );
  const handleTextInputChange = useCallback(
    (newValue: string) => {
      const oldValue = textInput;
      if (newValue !== oldValue) {
        unfreezeResponses();
      }
      if (textInputTimeoutRef.current) {
        clearTimeout(textInputTimeoutRef.current);
      }

      // Detect word completion: user typed a space after non-space characters
      if (
        newValue.length > oldValue.length &&
        newValue.endsWith(' ') &&
        !oldValue.endsWith(' ')
      ) {
        // A word was just completed, send current keywords
        sendCurrentKeywords(newValue.trim());
        setLastSentText(newValue);
      } else if (newValue.trim() === '' && oldValue.trim() !== '') {
        // Text was cleared, send null
        sendCurrentKeywords(null);
        setLastSentText('');
      }

      textInputTimeoutRef.current = setTimeout(() => {
        if (newValue !== lastSentText) {
          if (newValue.trim() !== '') {
            sendCurrentKeywords(newValue.trim());
          } else {
            sendCurrentKeywords(null);
          }
          setLastSentText(newValue);
        }
      }, 2000);
      setTextInput(newValue);
    },
    [textInput, sendCurrentKeywords, lastSentText, unfreezeResponses],
  );

  const handleDirectiveSubmit = useCallback(() => {
    if (!directiveInput.trim()) return;
    sendMessage(
      JSON.stringify({
        type: 'current.keywords',
        keywords: directiveInput,
        intent: 'directive',
      }),
    );
    setDirectiveInput('');
    unfreezeResponses();
  }, [directiveInput, sendMessage, unfreezeResponses]);

  const handleIntentClick = useCallback(
    (word: string, intent: string) => {
      sendMessage(
        JSON.stringify({
          type: 'current.keywords',
          keywords: word,
          intent,
        }),
      );
      unfreezeResponses();
    },
    [sendMessage, unfreezeResponses],
  );
  const handleSettingsOpen = useCallback(() => {
    if (shouldConnect) {
      setSettingsBlockedMessage(t('settings.lockedDuringConversation'));
      setTimeout(() => setSettingsBlockedMessage(null), 5000);
    } else {
      setIsSettingsOpen(true);
    }
  }, [shouldConnect, t]);
  const handleSettingsSave = useCallback((newSettings: UserSettings) => {
    setUserData((prev) =>
      prev
        ? {
            ...prev,
            user_settings: newSettings,
          }
        : null,
    );
    setIsSettingsOpen(false);
  }, []);
  const handleSettingsCancel = useCallback(() => {
    setIsSettingsOpen(false);
  }, []);
  const handleConversationSelect = useCallback(
    (index: number) => {
      if (shouldConnect) {
        // Don't allow switching conversations while connected
        return;
      }

      setSelectedConversationIndex(index);
      setIsViewingPastConversation(true);
      setIsShowingHistoryFromIdle(false);

      if (userData?.conversations[index]) {
        const selectedConversation = userData.conversations[index];
        const convertedHistory =
          convertConversationToChat(selectedConversation);
        setRawChatHistory(convertedHistory);
      }

      clearResponses();
      setTextInput('');
      setLastSentText('');
      if (textInputTimeoutRef.current) {
        clearTimeout(textInputTimeoutRef.current);
      }
      setCurrentSpeakerMessage('');
      setCurrentSpeakerMessageStartTime(null);
    },
    [shouldConnect, userData, clearResponses],
  );
  const handleNewConversation = useCallback(() => {
    if (shouldConnect) {
      // Don't allow creating new conversation while connected
      return;
    }

    setSelectedConversationIndex(null);
    setIsViewingPastConversation(false);
    setIsShowingHistoryFromIdle(false);
    setRawChatHistory([]);
    clearResponses();
    setTextInput('');
    setLastSentText('');
    if (textInputTimeoutRef.current) {
      clearTimeout(textInputTimeoutRef.current);
    }
    setCurrentSpeakerMessage('');
    setCurrentSpeakerMessageStartTime(null);
  }, [shouldConnect, clearResponses]);
  const handleDeleteConversation = useCallback((conversationIndex: number) => {
    setConversationToDelete(conversationIndex);
    setIsDeleteDialogOpen(true);
  }, []);
  const toggleDeleteConversationDialog = useCallback(() => {
    setIsDeleteDialogOpen((prev) => !prev);
  }, []);
  const confirmDeleteConversation = useCallback(async () => {
    if (conversationToDelete === null || !userData) {
      return;
    }

    try {
      const result = await deleteConversation(conversationToDelete);

      if (result.error) {
        setErrors((prev) => [
          ...prev,
          makeErrorItem(
            `${t('errors.failedToDeleteConversation')}: ${result.error}`,
          ),
        ]);
        return;
      }

      // Update local state by removing the conversation
      setUserData((prev) => {
        if (!prev) {
          return prev;
        }
        const newConversations = structuredClone(prev.conversations);
        newConversations.splice(conversationToDelete, 1);

        return {
          ...prev,
          conversations: newConversations,
        };
      });

      if (selectedConversationIndex === conversationToDelete) {
        setSelectedConversationIndex(null);
        setIsViewingPastConversation(false);
        setRawChatHistory([]);
        clearResponses();
        setTextInput('');
        setLastSentText('');
        if (textInputTimeoutRef.current) {
          clearTimeout(textInputTimeoutRef.current);
        }
        setCurrentSpeakerMessage('');
        setCurrentSpeakerMessageStartTime(null);
      } else if (
        selectedConversationIndex !== null &&
        selectedConversationIndex > conversationToDelete
      ) {
        // If we deleted a conversation before the selected one, adjust the index
        setSelectedConversationIndex((prev) =>
          prev !== null ? prev - 1 : null,
        );
      }
    } catch (error) {
      setErrors((prev) => [
        ...prev,
        makeErrorItem(`${t('errors.failedToDeleteConversation')}: ${error}`),
      ]);
    } finally {
      setConversationToDelete(null);
      setIsDeleteDialogOpen(false);
    }
  }, [
    conversationToDelete,
    userData,
    selectedConversationIndex,
    clearResponses,
    t,
  ]);

  // Archiving is non-destructive and reversible, so — unlike delete — it needs
  // no confirmation dialog. Flip the flag, persist (localStorage in local mode,
  // backend otherwise), and mirror it into React state so the row moves between
  // the main list and the "Archived" section immediately.
  const handleArchiveConversation = useCallback(
    async (conversationIndex: number, archived: boolean) => {
      if (!userData) {
        return;
      }
      try {
        const result = await setConversationArchived(
          conversationIndex,
          archived,
        );
        if (result.error) {
          setErrors((prev) => [
            ...prev,
            makeErrorItem(
              `${t('errors.failedToArchiveConversation')}: ${result.error}`,
            ),
          ]);
          return;
        }
        setUserData((prev) => {
          if (!prev) {
            return prev;
          }
          const newConversations = structuredClone(prev.conversations);
          if (
            conversationIndex >= 0 &&
            conversationIndex < newConversations.length
          ) {
            newConversations[conversationIndex] = {
              ...newConversations[conversationIndex],
              archived,
            };
          }
          return { ...prev, conversations: newConversations };
        });
      } catch (error) {
        setErrors((prev) => [
          ...prev,
          makeErrorItem(`${t('errors.failedToArchiveConversation')}: ${error}`),
        ]);
      }
    },
    [userData, t],
  );

  const handleSendMessage = useCallback(() => {
    if (!textInput.trim()) {
      return;
    }

    const customMessageId = crypto.randomUUID();

    setRawChatHistory((prev) => [
      ...prev,
      {
        role: 'assistant',
        content: textInput,
        timestamp: Date.now(),
        messageId: customMessageId,
      },
    ]);
    sendMessage(
      JSON.stringify({
        type: 'response.selected.by.writer',
        text: textInput,
        id: customMessageId,
      }),
    );
    playTTSStream({
      text: textInput,
      cacheType: 'temporary',
      messageId: customMessageId,
      useNativeVoice,
    }).catch(console.error);

    setTextInput('');
    setLastSentText('');
    if (textInputTimeoutRef.current) {
      clearTimeout(textInputTimeoutRef.current);
    }
    clearResponses();
    sendCurrentKeywords(null);
  }, [
    textInput,
    sendMessage,
    sendCurrentKeywords,
    clearResponses,
    useNativeVoice,
  ]);
  const checkHealth = useCallback(async (): Promise<HealthStatus> => {
    const backendHealthUrl = apiUrl(`/v1/health`);
    const internetUp = hasInternetConnectivity();

    const buildLocalHealth = async (
      connected: HealthStatus['connected'],
      overrides?: Partial<HealthStatus>,
    ): Promise<HealthStatus> => {
      const llmReady = (await getLocalLlm()?.isReady()) ?? false;
      const nextStatus: HealthStatus = {
        connected,
        ok: llmReady,
        mode: 'local',
        internet_up: internetUp,
        backend_up: false,
        backend_url: backendHealthUrl,
        stt_up: true,
        tts_up: true,
        llm_up: llmReady,
        ...overrides,
      };
      setHealthStatus(nextStatus);
      return nextStatus;
    };

    // 100%-local mode: no backend. Health depends only on the on-device engine
    // (STT/TTS are always native). Never make a network call, so it works in
    // airplane mode.
    if (isLocalMode()) {
      // Hybrid: prefer the cloud backend (better suggestions) when it is
      // reachable; otherwise fall back to the on-device model so the app still
      // works fully offline (airplane mode included). STT/TTS are always native.
      // A backend-less build skips the probe entirely — zero network.
      if (!isLocalOnlyMode()) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 3000);
          const response = await fetch(backendHealthUrl, {
            signal: controller.signal,
            headers: addAuthHeaders(),
          });
          clearTimeout(timeoutId);
          if (response.ok) {
            const data = await response.json();
            if (data.ok) {
              const nextStatus: HealthStatus = {
                ...data,
                connected: 'yes_request_ok',
                mode: 'cloud',
                internet_up: true,
                backend_up: true,
                // STT/TTS are always the device's, independent of the backend.
                stt_up: true,
                tts_up: true,
                backend_url: backendHealthUrl,
              };
              setHealthStatus(nextStatus);
              return nextStatus;
            }
            return buildLocalHealth('yes_request_ok', {
              internet_up: true,
              backend_up: true,
            });
          }
          return buildLocalHealth('yes_request_fail', {
            internet_up: true,
            backend_up: true,
          });
        } catch {
          // Unreachable/offline: fall through to the on-device engine below.
        }
      }
      // Backend unreachable: the on-device engine is the only way to suggest
      // answers. If it is not loaded yet there is nothing to fall back to, so
      // report unhealthy rather than pretending the app works.
      return buildLocalHealth('no');
    }
    try {
      const controller = new AbortController();
      // On native Android we may need a bit more time because /v1/health now
      // also checks LLM reachability (quick network call). Keep UX responsive
      // but avoid false negatives due to an overly short abort.
      const timeoutMs = isNativeApp() ? 6000 : 3000;
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(backendHealthUrl, {
        signal: controller.signal,
        headers: addAuthHeaders(),
      });

      clearTimeout(timeoutId);
      if (!response.ok) {
        const nextStatus: HealthStatus = {
          connected: 'yes_request_fail',
          ok: false,
          internet_up: true,
          backend_up: true,
          backend_url: backendHealthUrl,
          // On Android, STT/TTS are native/offline: they can still work even
          // when the backend is down/unreachable.
          ...(isNativeApp()
            ? { stt_up: true, tts_up: true, llm_up: false }
            : {}),
        };
        setHealthStatus(nextStatus);
        return nextStatus;
      }
      const data = await response.json();
      const nextStatus: HealthStatus = {
        ...data,
        connected: 'yes_request_ok',
        mode: 'cloud',
        internet_up: true,
        backend_up: true,
        // Make the UI deterministic on native Android: TTS uses the device
        // engine and does not depend on the backend.
        ...(isNativeApp() ? { tts_up: true } : {}),
        ...(isNativeApp() ? { backend_url: backendHealthUrl } : {}),
      };
      setHealthStatus(nextStatus);
      return nextStatus;
    } catch {
      const nextStatus: HealthStatus = {
        connected: 'no',
        ok: false,
        internet_up: internetUp,
        backend_up: false,
        backend_url: backendHealthUrl,
        ...(isNativeApp() ? { stt_up: true, tts_up: true, llm_up: false } : {}),
      };
      setHealthStatus(nextStatus);
      return nextStatus;
    }
  }, []);

  const onConnectButtonPress = useCallback(async () => {
    // Don't allow connecting when viewing a past conversation
    if (isViewingPastConversation) {
      return;
    }

    if (!shouldConnect) {
      const latestHealth = await checkHealth();
      if (!latestHealth.ok) {
        return;
      }

      // Check token limit before connecting
      if (userData?.user_settings) {
        const totalTokens = calculateTotalTokens(userData.user_settings);
        const limitTokens = 64000;
        if (totalTokens > limitTokens) {
          const tokenErrorMessage = `The total number of tokens used in the documents and prompt is currently ${formatTokenCount(totalTokens)} which is above the limit of ${formatTokenCount(limitTokens)}, please remove or reduce the size of some documents.`;
          setErrors((prev) => {
            const filteredErrors = prev.filter(
              (error) => !error.message.includes('total number of tokens'),
            );
            return [...filteredErrors, makeErrorItem(tokenErrorMessage)];
          });
          return; // Prevent connection
        }
        setErrors((prev) =>
          prev.filter(
            (error) => !error.message.includes('total number of tokens'),
          ),
        );
      }

      // Decide from the *fresh* health, not the (async) healthStatus state: the
      // native app streams mic audio to the backend when online (Gradium STT)
      // and only uses the phone's own recognizer when the backend is
      // unreachable. This mirrors the LLM hybrid switch so voice and suggestions
      // come from the same place.
      const willUseLocal = shouldUseLocalFallback(localCapable, latestHealth);
      if (isNativeApp() && willUseLocal) {
        // Offline native fallback: the speech-recognition plugin owns the
        // microphone, no getUserMedia/opus pipeline needed. Listening starts
        // once the (local) conversation is open — see the native listening
        // effect.
        const available = await isNativeSpeechAvailable();
        const granted = available && (await requestNativeSpeechPermission());
        if (!granted) {
          setErrors((prev) => [
            ...prev,
            makeErrorItem(t('errors.microphoneAccessNeeded')),
          ]);
          return;
        }
        setShouldConnect(true);
        return;
      }

      // Online (native or web): stream microphone audio to the backend, which
      // runs Gradium STT. On native, getUserMedia inside the Android WebView
      // only succeeds once the OS RECORD_AUDIO permission is granted. Request it
      // explicitly first (it maps to RECORD_AUDIO, the same permission the
      // recognizer uses) rather than relying on the WebView's implicit prompt,
      // whose behaviour varies across Capacitor versions.
      if (isNativeApp()) {
        const granted = await requestNativeSpeechPermission();
        if (!granted) {
          setErrors((prev) => [
            ...prev,
            makeErrorItem(t('errors.microphoneAccessNeeded')),
          ]);
          return;
        }
      }
      const mediaStream = await askMicrophoneAccess();
      if (mediaStream) {
        await setupAudio(mediaStream);
        setShouldConnect(true);
      }
    } else {
      setShouldConnect(false);
      shutdownAudio();
    }
  }, [
    askMicrophoneAccess,
    isViewingPastConversation,
    localCapable,
    setupAudio,
    shouldConnect,
    shutdownAudio,
    userData?.user_settings,
    checkHealth,
    t,
  ]);
  const onResponseEdit = useCallback(
    (editedText: string) => {
      const editedMessageId = crypto.randomUUID();
      setRawChatHistory((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: editedText,
          timestamp: Date.now(),
          messageId: editedMessageId,
        },
      ]);
      sendMessage(
        JSON.stringify({
          type: 'response.selected.by.writer',
          text: editedText,
          id: editedMessageId,
        }),
      );
      playTTSStream({
        text: editedText,
        cacheType: 'temporary',
        messageId: editedMessageId,
        useNativeVoice,
      }).catch(console.error);

      clearResponses();
      setTextInput('');
      setLastSentText('');
      if (textInputTimeoutRef.current) {
        clearTimeout(textInputTimeoutRef.current);
      }
      sendCurrentKeywords(null);
    },
    [clearResponses, sendCurrentKeywords, sendMessage, useNativeVoice],
  );

  useEffect(() => {
    const fetchUserData = async () => {
      setUserDataError(null);
      const result = await getUserData();

      if (result.error) {
        console.error('Failed to fetch user data:', result.error);
        setUserDataError(result.error);
      } else if (result.data) {
        setUserData(result.data);
      }
    };

    fetchUserData();
  }, []);

  // Pre-cache the audio of quick phrases and of the emergency call (cloned
  // voice) so they can be spoken instantly, even offline. No-op once
  // everything is cached.
  useEffect(() => {
    if (!userData?.user_settings) {
      return;
    }
    const appointmentPhrases = (
      userData.user_settings.appointments ?? []
    ).flatMap((appointment) =>
      appointment.phrases
        .filter((phrase) => phrase.trim())
        .map((phrase) => ({ text: phrase, category: '' })),
    );
    prefetchQuickPhrases(
      [
        { text: t('conversation.emergencyPhrase'), category: '' },
        ...(userData.user_settings.quick_phrases ?? []),
        ...appointmentPhrases,
      ],
      userData.user_settings.voice,
    ).catch(console.error);
  }, [userData?.user_settings, t]);

  // Keep a local snapshot of the settings so the offline fallback knows the
  // quick phrases and voice even when the backend is unreachable.
  useEffect(() => {
    if (userData?.user_settings) {
      saveSettingsSnapshot(userData.user_settings);
    }
  }, [userData?.user_settings]);

  useWakeLock(shouldConnect);

  useEffect(() => {
    if (!backendServerUrl) {
      return;
    }
    checkHealth().catch(() => {});
  }, [backendServerUrl, checkHealth]);

  // Native app: make the on-device fallback usable. Downloads the model on
  // first run (once, ~1 GB) and loads it into the llama.cpp engine, so that a
  // later loss of connectivity can fall back to it instead of dying.
  // Re-check health afterwards: `llm_up` depends on the engine being loaded.
  useEffect(() => {
    if (!isLocalMode()) {
      return;
    }
    ensureLocalModelReady(setModelState)
      .then((path) => {
        if (path) {
          checkHealth().catch(() => {});
        }
        return path;
      })
      .catch((e) => {
        console.warn('[local] on-device model unavailable', e);
      });
  }, [checkHealth]);

  // While unhealthy, retry periodically so the app recovers on its own when
  // the connection comes back.
  useEffect(() => {
    if (!healthStatus || healthStatus.ok) {
      return undefined;
    }
    const intervalId = setInterval(() => {
      checkHealth().catch(() => {});
    }, 10000);
    return () => clearInterval(intervalId);
  }, [healthStatus, checkHealth]);

  useEffect(() => {
    const handleConnectivityChange = () => {
      checkHealth().catch(() => {});
    };
    window.addEventListener('online', handleConnectivityChange);
    window.addEventListener('offline', handleConnectivityChange);
    return () => {
      window.removeEventListener('online', handleConnectivityChange);
      window.removeEventListener('offline', handleConnectivityChange);
    };
  }, [checkHealth]);

  useEffect(() => {
    if (microphoneAccess === 'refused') {
      setErrors((prev) => {
        const microphoneErrorExists = prev.some((error) =>
          error.message.includes('microphone access'),
        );
        if (!microphoneErrorExists) {
          const isInsecure =
            !window.isSecureContext || !window.navigator.mediaDevices;
          return [
            ...prev,
            makeErrorItem(
              isInsecure
                ? t('errors.microphoneRequiresHttps')
                : t('errors.microphoneAccessNeeded'),
            ),
          ];
        }
        return prev;
      });
    }
  }, [microphoneAccess, t]);

  // Keyboard shortcuts for response selection
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isViewingPastConversation) {
        return;
      }

      const { activeElement } = document;
      const isInputField =
        activeElement &&
        (activeElement.tagName === 'INPUT' ||
          activeElement.tagName === 'TEXTAREA' ||
          activeElement.getAttribute('contenteditable') === 'true');

      if (isInputField) {
        return;
      }

      const isAzerty = uiSettings.keyboardLayout === 'azerty';
      const validShortcuts = isAzerty
        ? ['a', 'z', 'q', 's', 'w', 'x']
        : ['a', 's', 'd', 'f', 'z', 'x'];

      const responseIndex = validShortcuts.indexOf(event.key.toLowerCase());

      // Handle Shift+Shortcuts for editing responses
      if (
        event.shiftKey &&
        responseIndex !== -1 &&
        responseIndex < NB_RESPONSES
      ) {
        event.preventDefault();
        const responsesToUse = frozenResponses || pendingResponses;
        const allResponses = [
          ...Array.from({ length: NB_RESPONSES }, (_, index) => {
            const existingResponse = responsesToUse[index];
            return (
              existingResponse || {
                id: `empty-${index}`,
                text: '',
                isComplete: false,
              }
            );
          }),
        ];

        const selectedResponse = allResponses[responseIndex];
        if (
          selectedResponse &&
          selectedResponse.text.trim() &&
          selectedResponse.isComplete
        ) {
          // Trigger edit mode by programmatically clicking the edit button
          const responseElements = document.querySelectorAll(
            '[data-response-index]',
          );
          const targetElement = responseElements[responseIndex];
          if (targetElement) {
            const editButton = targetElement.querySelector(
              '[data-edit-response]',
            ) as HTMLButtonElement | null;
            if (editButton) {
              editButton.click();
            }
          }
        }
        return;
      }

      if (responseIndex !== -1 && !event.shiftKey) {
        event.preventDefault();

        if (responseIndex === 4) {
          handleResponseSelection('static-context-question');
        } else if (responseIndex === 5) {
          handleResponseSelection('static-repeat-question');
        } else {
          const responsesToUse = frozenResponses || pendingResponses;
          const allResponses = [
            ...Array.from({ length: NB_RESPONSES }, (_, index) => {
              const existingResponse = responsesToUse[index];
              return (
                existingResponse || {
                  id: `empty-${index}`,
                  text: '',
                  isComplete: false,
                }
              );
            }),
          ];

          const selectedResponse = allResponses[responseIndex];
          if (
            selectedResponse &&
            selectedResponse.text.trim() &&
            selectedResponse.isComplete
          ) {
            handleResponseSelection(selectedResponse.id);
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    pendingResponses,
    frozenResponses,
    handleResponseSelection,
    isViewingPastConversation,
    shouldConnect,
    uiSettings.keyboardLayout,
  ]);

  // Handle websocket disconnection
  useEffect(() => {
    if (readyState === ReadyState.CLOSING || readyState === ReadyState.CLOSED) {
      setShouldConnect(false);
      shutdownAudio();

      // Re-fetch user data when WebSocket connection is fully closed
      // This ensures the backend has had time to save the conversation
      if (readyState === ReadyState.CLOSED) {
        const fetchUserData = async () => {
          setUserDataError(null);
          const result = await getUserData();

          if (result.error) {
            console.error(
              'Failed to fetch user data after disconnect:',
              result.error,
            );
            setUserDataError(result.error);
          } else if (result.data) {
            setUserData(result.data);
          }
        };

        fetchUserData();
      }
    }
  }, [readyState, shutdownAudio]);

  // When we connect, send the initial config and clear chat history
  useEffect(() => {
    if (readyState !== ReadyState.OPEN) {
      return;
    }

    setRawChatHistory([]);
    clearResponses();
    setCurrentSpeakerMessage('');
    setCurrentSpeakerMessageStartTime(null);
    nativeCommittedTextRef.current = '';

    // On mobile, default to XS so the compact chips above the text input
    // receive short responses. The layout sends M when Responses tab is active.
    if (isMobile) {
      sendMessage(
        JSON.stringify({
          type: 'desired.responses.length',
          length: RESPONSES_SIZES.XS,
        }),
      );
    }
  }, [readyState, clearResponses, isMobile, sendMessage]);

  // Cleanup temporary TTS cache when component unmounts
  useEffect(() => {
    return () => {
      ttsCache.clearTemporary();
    };
  }, []);

  if (!healthStatus || !backendServerUrl) {
    return (
      <div className='flex flex-col items-center justify-center min-h-screen gap-4'>
        <h1 className='mb-4 text-xl'>{t('common.loading')}</h1>
      </div>
    );
  }

  // First run with no reachable backend: the on-device model is still
  // downloading. That is a wait, not a failure, so don't show the offline error
  // screen over it. When the backend IS reachable the download stays in the
  // background and the user keeps talking through the cloud.
  if (preferLocal && modelState.status === 'downloading') {
    return (
      <ModelDownloadScreen
        receivedBytes={modelState.receivedBytes}
        totalBytes={modelState.totalBytes}
      />
    );
  }

  if (healthStatus && !healthStatus.ok) {
    return (
      <OfflineFallback
        healthStatus={healthStatus}
        onRetry={checkHealth}
      />
    );
  }

  return (
    <Fragment>
      <ConversationLayout
        shouldConnect={shouldConnect}
        onConnectButtonPress={onConnectButtonPress}
        isMobile={isMobile}
        chatHistory={rawChatHistory}
        currentSpeakerMessage={currentSpeakerMessage}
        pendingResponses={pendingResponses}
        frozenResponses={frozenResponses}
        onResponseSelect={handleResponseSelection}
        onResponseEdit={onResponseEdit}
        onResponseSizeChange={handleSelectResponseSize}
        pendingKeywords={pendingKeywords}
        textInput={textInput}
        onTextInputChange={handleTextInputChange}
        onSendMessage={handleSendMessage}
        directiveInput={directiveInput}
        onDirectiveInputChange={setDirectiveInput}
        onDirectiveSubmit={handleDirectiveSubmit}
        isInitiating={isInitiating}
        onToggleInitiating={handleToggleInitiating}
        userData={userData}
        userDataError={userDataError}
        selectedConversationIndex={selectedConversationIndex}
        isViewingPastConversation={isViewingPastConversation}
        isShowingHistoryFromIdle={isShowingHistoryFromIdle}
        onConversationSelect={handleConversationSelect}
        onNewConversation={handleNewConversation}
        onDeleteConversation={handleDeleteConversation}
        onArchiveConversation={handleArchiveConversation}
        onShowHistoryFromIdle={() => setIsShowingHistoryFromIdle(true)}
        onBack={() => {
          if (isViewingPastConversation) {
            setIsViewingPastConversation(false);
            setSelectedConversationIndex(null);
            setIsShowingHistoryFromIdle(true);
          } else {
            setIsShowingHistoryFromIdle(false);
          }
        }}
        isSettingsOpen={isSettingsOpen}
        settingsBlockedMessage={settingsBlockedMessage}
        onSettingsOpen={handleSettingsOpen}
        onSettingsSave={handleSettingsSave}
        onSettingsCancel={handleSettingsCancel}
        errors={errors}
        setErrors={setErrors}
        onWordBubbleClick={handleWordBubbleClick}
        onKeywordSelect={handleKeywordSelect}
        onIntentClick={handleIntentClick}
        onQuickPhraseSelect={handleQuickPhraseSelect}
        debugDict={debugDict}
      />
      <ConfirmationDialog
        isOpen={isDeleteDialogOpen}
        onClose={toggleDeleteConversationDialog}
        onConfirm={confirmDeleteConversation}
        title={t('conversation.deleteConversation')}
        message={t('conversation.deleteConversationMessage')}
        confirmText={t('common.delete')}
        cancelText={t('common.cancel')}
      />
    </Fragment>
  );
};

export default InvincibleVoice;
