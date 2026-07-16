// Drop-in local replacement for the conversation WebSocket (native app only).
//
// In 100%-local mode the phone must produce the suggested answers itself, with
// no backend. Rather than rewrite every call site in InvincibleVoice, this hook
// mimics the exact interface of `useWebSocket` from react-use-websocket:
// it returns `{ sendMessage, readyState }`. It intercepts the outgoing client
// events the app already sends, runs the on-device pipeline (prompt builder +
// local LLM), and feeds the results back as `one.response` / `one.keyword`
// server events into the *same* `onMessage` handler. From InvincibleVoice's
// point of view nothing changed — the messages just come from the phone.
//
// Outgoing client events handled (see openai_realtime_api_events.py):
//   speaker.text.append        -> add speaker turn, (re)generate
//   current.keywords           -> update guiding keywords/intent, regenerate
//   desired.responses.length   -> update length, regenerate
//   initiate.conversation      -> openers mode, generate openers
//   response.selected.by.writer-> record the user's choice (history/style)
//   input_audio_buffer.append  -> ignored (native uses on-device STT)

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { ReadyState } from 'react-use-websocket';

import { ResponseSize } from '@/constants';
import { getLocalLlm } from '@/utils/localLlm';
import {
  appendLocalConversation,
  loadLocalUserData,
  saveLocalUserData,
} from '@/utils/localUserData';
import {
  normalizeUserMemory,
  updateMemoryFromConversation,
} from '@/utils/memory';
import {
  buildSystemPrompt,
  buildUserTurn,
  PromptParams,
} from '@/utils/promptBuilder';
import { ConversationMessage, UserData, UserSettings } from '@/utils/userData';

interface OutgoingEvent {
  type: string;
  text?: string;
  keywords?: string | null;
  intent?: string | null;
  length?: ResponseSize;
  active?: boolean;
  topic?: string | null;
  id?: string;
}

export interface UseLocalConversationOptions {
  /** True in the native app (100%-local mode). When false the hook is inert. */
  enabled: boolean;
  /**
   * Whether the conversation is active (mirror of `shouldConnect`). The channel
   * only reports OPEN — which is what starts on-device listening — once the
   * user has actually started the conversation, exactly like the real socket.
   */
  connected: boolean;
  userData: UserData | null;
  /** Same callback react-use-websocket calls (reads only `event.data`). */
  onMessage: (event: MessageEvent) => void;
}

const DEFAULT_SETTINGS: UserSettings = {
  name: '',
  prompt: '',
  additional_keywords: [],
  friends: [],
  documents: [],
  quick_phrases: [],
  appointments: [],
  voice: null,
  expected_transcription_language: null,
  accepted_terms_of_services: true,
  learn_style: false,
};

export function useLocalConversation({
  enabled,
  connected,
  userData,
  onMessage,
}: UseLocalConversationOptions): {
  sendMessage: (message: string) => void;
  readyState: ReadyState;
} {
  // Keep everything in refs so generation always sees the latest state without
  // re-creating callbacks or causing re-renders.
  const onMessageRef = useRef(onMessage);
  const userDataRef = useRef(userData);
  const messagesRef = useRef<ConversationMessage[]>([]);
  const keywordsRef = useRef<string | null>(null);
  const intentRef = useRef<string | null>(null);
  const lengthRef = useRef<ResponseSize>('M');
  const initiatingRef = useRef<boolean>(false);
  const topicRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const generateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Start time of the current on-device conversation, so the persisted history
  // carries a real date (same shape as the backend-saved conversations).
  const startTimeRef = useRef<string>('');

  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);
  useEffect(() => {
    userDataRef.current = userData;
  }, [userData]);

  const emit = useCallback((event: Record<string, unknown>) => {
    // handleInComingMessage only reads `.data`, so a minimal object cast to
    // MessageEvent is enough and avoids constructing a real event.
    onMessageRef.current({
      data: JSON.stringify({
        event_id: `local_${crypto.randomUUID()}`,
        ...event,
      }),
    } as MessageEvent);
  }, []);

  const generate = useCallback(async () => {
    // Cancel any in-flight generation: a newer trigger supersedes it.
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    const base = userDataRef.current;
    const settings = base?.user_settings ?? DEFAULT_SETTINGS;
    const promptUserData: UserData = {
      email: base?.email ?? '',
      user_id: base?.user_id ?? '',
      user_settings: settings,
      // The current conversation is always the last one for the prompt builder.
      conversations: [
        ...(base?.conversations ?? []),
        { messages: messagesRef.current, start_time: new Date().toISOString() },
      ],
      // Carry the durable memory so the on-device prompt injects the user's
      // distilled facts / tone profile / style exchanges exactly like the
      // backend. normalizeUserMemory() guards against a missing layer.
      memory: base?.memory,
    };

    const params: PromptParams = {
      keywords: keywordsRef.current,
      intent: intentRef.current,
      desiredLength: lengthRef.current,
      initiating: initiatingRef.current,
      initiatingTopic: topicRef.current,
    };

    const llm = getLocalLlm();
    if (!llm) {
      emit({
        type: 'error',
        error: {
          type: 'warning',
          message: 'The on-device model is not ready yet.',
        },
      });
      return;
    }

    try {
      const system = buildSystemPrompt(promptUserData, params);
      await llm.generate(
        { system, user: buildUserTurn() },
        {
          signal: ac.signal,
          onAnswer: (index, text) => {
            if (ac.signal.aborted) return;
            emit({
              type: 'one.response',
              content: text,
              index,
              timestamp: new Date().toISOString(),
            });
          },
          onKeyword: (index, text) => {
            if (ac.signal.aborted) return;
            emit({
              type: 'one.keyword',
              content: text,
              index,
              timestamp: new Date().toISOString(),
            });
          },
        },
      );
    } catch (error) {
      if (!ac.signal.aborted) {
        emit({
          type: 'error',
          error: {
            type: 'warning',
            message: `Local generation failed: ${
              error instanceof Error ? error.message : String(error)
            }`,
          },
        });
      }
    }
  }, [emit]);

  // Coalesce bursts of triggers (the connect-time length/keyword events, or the
  // speech recognizer firing on ambient noise) into a single generation so we
  // never pile up slow on-device runs.
  const scheduleGenerate = useCallback(() => {
    if (generateTimerRef.current) {
      clearTimeout(generateTimerRef.current);
    }
    generateTimerRef.current = setTimeout(() => {
      generateTimerRef.current = null;
      generate().catch(() => {});
    }, 350);
  }, [generate]);

  const sendMessage = useCallback(
    (message: string) => {
      if (!enabled) return;
      let event: OutgoingEvent;
      try {
        event = JSON.parse(message) as OutgoingEvent;
      } catch {
        return;
      }

      switch (event.type) {
        case 'speaker.text.append': {
          const text = (event.text ?? '').trim();
          if (!text) return;
          messagesRef.current = [
            ...messagesRef.current,
            { speaker: 'Unknown speaker', content: text },
          ];
          scheduleGenerate();
          break;
        }
        case 'current.keywords': {
          keywordsRef.current = event.keywords ?? null;
          intentRef.current = event.intent ?? null;
          scheduleGenerate();
          break;
        }
        case 'desired.responses.length': {
          if (event.length) lengthRef.current = event.length;
          scheduleGenerate();
          break;
        }
        case 'initiate.conversation': {
          initiatingRef.current = Boolean(event.active);
          topicRef.current = event.topic ?? null;
          if (initiatingRef.current) scheduleGenerate();
          break;
        }
        case 'response.selected.by.writer': {
          const text = (event.text ?? '').trim();
          if (text) {
            messagesRef.current = [
              ...messagesRef.current,
              { content: text, messageId: event.id ?? crypto.randomUUID() },
            ];
          }
          // Once the user has spoken an opener, go back to reactive mode.
          initiatingRef.current = false;
          break;
        }
        // input_audio_buffer.append and everything else: ignored in local mode.
        default:
          break;
      }
    },
    [enabled, scheduleGenerate],
  );

  // Start each conversation from a clean slate (new "socket").
  useEffect(() => {
    if (!enabled || !connected) return undefined;
    messagesRef.current = [];
    keywordsRef.current = null;
    intentRef.current = null;
    initiatingRef.current = false;
    topicRef.current = null;
    startTimeRef.current = new Date().toISOString();
    return () => {
      // Persist the finished conversation so it survives the session, exactly
      // like the backend saving on WebSocket disconnect. This is what lets the
      // on-device prompt replay past turns and feed learn_style next time.
      // We also fold the conversation into the durable memory (synchronous,
      // LLM-free style pass), mirroring `UnmuteHandler.cleanup` so the user's
      // distilled style survives offline. Fact extraction / tone-profile
      // refresh are LLM-driven and stay server-side.
      if (messagesRef.current.length > 0) {
        const finished = {
          messages: messagesRef.current,
          start_time: startTimeRef.current || new Date().toISOString(),
        };
        const base = loadLocalUserData();
        if (base) {
          const memory = normalizeUserMemory(base.memory);
          updateMemoryFromConversation(memory, finished);
          saveLocalUserData({
            ...base,
            conversations: [...base.conversations, finished],
            memory,
          });
        } else {
          appendLocalConversation(finished);
        }
      }
      abortRef.current?.abort();
      if (generateTimerRef.current) {
        clearTimeout(generateTimerRef.current);
      }
    };
  }, [enabled, connected]);

  // OPEN only once the conversation is active, mirroring the real socket, so
  // on-device listening doesn't start on the idle home screen.
  const readyState = useMemo(
    () => (enabled && connected ? ReadyState.OPEN : ReadyState.CLOSED),
    [enabled, connected],
  );

  return { sendMessage, readyState };
}
