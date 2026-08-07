import { STATIC_MESSAGE_UUIDS } from '@/constants';
import type { Locale } from '@/i18n/config';
import { ChatMessage } from '@/types/chatHistory';
import { Conversation, isSpeakerMessage, isWriterMessage } from './userData';

const DATE_LOCALES: Record<Locale, string> = {
  en: 'en-US',
  fr: 'fr-FR',
  de: 'de-DE',
  es: 'es-ES',
  pt: 'pt-PT',
};

export function convertConversationToChat(
  conversation: Conversation,
): ChatMessage[] {
  return conversation.messages.map((message, index): ChatMessage => {
    if (isSpeakerMessage(message)) {
      return {
        role: 'user',
        content: message.content,
        timestamp: Date.now() + index,
      };
    }
    if (isWriterMessage(message)) {
      return {
        role: 'assistant',
        content: message.content,
        timestamp: Date.now() + index,
      };
    }
    return {
      role: 'user',
      content: 'Unknown message type',
      timestamp: Date.now() + index,
    };
  });
}

export const getStaticContextOption = (t: (key: string) => string) => ({
  id: 'static-context-question',
  text: t('conversation.contextQuestion'),
  isComplete: true,
  messageId: STATIC_MESSAGE_UUIDS.CONTEXT_QUESTION,
});

export const getStaticRepeatOption = (t: (key: string) => string) => ({
  id: 'static-repeat-question',
  text: t('conversation.repeatQuestion'),
  isComplete: true,
  messageId: STATIC_MESSAGE_UUIDS.REPEAT_QUESTION,
});

export type DayGroupKey = 'today' | 'yesterday' | 'older';

export const DAY_GROUP_ORDER: DayGroupKey[] = ['today', 'yesterday', 'older'];

export function getDayGroup(conversation: Conversation): DayGroupKey {
  if (!conversation.start_time) {
    return 'older';
  }
  const date = new Date(conversation.start_time);
  if (Number.isNaN(date.getTime())) {
    return 'older';
  }
  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  );
  const startOfConv = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  );
  const diffDays = Math.floor(
    (startOfToday.getTime() - startOfConv.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (diffDays === 0) {
    return 'today';
  }
  if (diffDays === 1) {
    return 'yesterday';
  }
  return 'older';
}

export function getDayGroupLabel(
  key: DayGroupKey,
  t: (key: string) => string,
): string {
  if (key === 'today') {
    return t('conversation.today');
  }
  if (key === 'yesterday') {
    return t('conversation.yesterday');
  }
  return t('conversation.olderConversations');
}

export function formatConversationPreview(
  conversation: Conversation,
  t: (key: string) => string,
): string {
  if (conversation.messages.length === 0) {
    return t('conversation.emptyConversation');
  }
  const firstMessage = conversation.messages[0];
  if (
    (isSpeakerMessage(firstMessage) || isWriterMessage(firstMessage)) &&
    firstMessage.content
  ) {
    return firstMessage.content;
  }
  return t('conversation.newChat');
}

export function formatConversationDate(
  conversation: Conversation,
  t: (key: string) => string,
  locale: Locale = 'en',
): string {
  if (!conversation.start_time) {
    return '';
  }
  try {
    const date = new Date(conversation.start_time);
    if (Number.isNaN(date.getTime())) {
      console.warn(
        'Failed to parse conversation start_time:',
        conversation.start_time,
      );
      return '';
    }
    const dateLocale = DATE_LOCALES[locale] ?? locale;
    const now = new Date();
    const diffInMs = now.getTime() - date.getTime();
    const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));
    if (diffInDays === 0) {
      return date.toLocaleTimeString(dateLocale, {
        hour: '2-digit',
        minute: '2-digit',
      });
    }
    if (diffInDays === 1) {
      return t('conversation.yesterday');
    }
    if (diffInDays < 7) {
      return date.toLocaleDateString(dateLocale, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      });
    }
    if (diffInDays < 365) {
      return date.toLocaleDateString(dateLocale, {
        month: 'short',
        day: 'numeric',
      });
    }
    return date.toLocaleDateString(dateLocale, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    console.warn(
      'Failed to parse conversation start_time:',
      conversation.start_time,
    );
    return '';
  }
}
