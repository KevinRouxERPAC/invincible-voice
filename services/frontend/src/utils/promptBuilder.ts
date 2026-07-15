// On-device prompt builder.
//
// TypeScript port of the backend's prompt construction
// (services/backend/backend/storage.py::to_llm_ready_conversation and
// backend/llm/system_prompt.py) so the native app can build the LLM prompt
// itself, with no server involved.
//
// KEY DIFFERENCE vs the backend: this runs on the phone in front of a small
// model, so latency and RAM are dominated by the prompt length. We therefore
// apply *tight budgets* (fewer past conversations, capped documents, capped
// style examples). These are the main knobs for the "fast & light" goal.

import { NB_KEYWORDS, NB_RESPONSES, ResponseSize } from '@/constants';
import {
  Conversation,
  UserData,
  isSpeakerMessage,
  isWriterMessage,
} from '@/utils/userData';

// --- Budgets (on-device). Tune these for latency/RAM. ---
const MAX_PAST_CONVERSATIONS = 2; // backend uses 10
const MAX_DOCUMENTS = 3;
const MAX_DOCUMENT_CHARS = 500;
const MAX_STYLE_EXAMPLES = 8; // backend uses 12
const MAX_MESSAGES_PER_PAST_CONVERSATION = 12;

const LENGTH_TO_NB_WORDS: Record<ResponseSize, [number, number]> = {
  XS: [1, 5],
  S: [3, 10],
  M: [5, 15],
  L: [8, 20],
  XL: [12, 25],
};

/** Mirror of backend build_system_prompt() with the same NB_* constants. */
function baseSystemPrompt(): string {
  return `
# System prompt
You are the assistant of a user suffering from ALS (Amyotrophic Lateral Sclerosis).

You must help them because they have difficulty writing, and do so by suggesting answers and keywords.

## Desired output

Based on a conversation history between someone speaking aloud and the user, you must suggest:

${NB_RESPONSES} plausible responses for the user, covering a wide range of possibilities.
These correspond to the JSON key "suggested_answers". Always produce these first:
they are what the user reads and speaks to intervene quickly in the conversation.

${NB_KEYWORDS} keywords that could help the user refine their responses on the topic.
These should be varied and related to the most recent phrases (think "short replies").
Do not include the user's friends in the keywords.
These correspond to the JSON key "suggested_keywords".

## Guiding the suggestions

The user can guide you with keywords (optional). If they do, do NOT repeat those exact
keywords in "suggested_keywords", but DO use them (on an abstract level) in every suggested answer.

## Language and style

Answer in the language of the conversation (default French). Keep all responses concise and simple.
If a "How the user likes to phrase things" section is provided, mirror that tone and sentence length.
An "Initiating mode" section means the user is taking the floor: suggest openers, not replies.

## Considerations

The speaker's lines are transcribed by speech recognition and may contain errors
(e.g. "classe de CO2" likely means "classe de CM2"). The chosen answer is spoken aloud by TTS.
`.trim();
}

export interface PromptParams {
  /** Guiding keywords the user selected (backend: current_keywords / hint). */
  keywords?: string | null;
  /** Intent/action, or the special value "directive" for a direct instruction. */
  intent?: string | null;
  desiredLength: ResponseSize;
  initiating?: boolean;
  initiatingTopic?: string | null;
}

/** Sentences the user actually chose in the past, to teach their phrasing style. */
function chosenStyleExamples(userData: UserData, limit: number): string[] {
  const seen = new Set<string>();
  const examples: string[] = [];
  // Skip the current (last) conversation: it has no finalized choices yet.
  userData.conversations
    .slice(0, -1)
    .flatMap((conversation) => conversation.messages)
    .forEach((message) => {
      if (!isWriterMessage(message)) return;
      const text = message.content.trim();
      if (!text || seen.has(text)) return;
      seen.add(text);
      examples.push(text);
    });
  return examples.slice(-limit);
}

function renderConversation(
  parts: string[],
  conversation: Conversation,
  userName: string,
  maxMessages?: number,
): void {
  const messages = maxMessages
    ? conversation.messages.slice(-maxMessages)
    : conversation.messages;
  messages.forEach((message) => {
    if (isSpeakerMessage(message)) {
      parts.push(`* Speaker: ${message.content.trim()}`);
    } else {
      parts.push(`* ${userName} says: ${message.content.trim()}`);
    }
  });
}

/**
 * Build the full system prompt. Mirrors to_llm_ready_conversation but with
 * on-device budgets. Returns the system text; the caller supplies the short
 * user turn that triggers generation (see buildUserTurn).
 */
export function buildSystemPrompt(
  userData: UserData,
  params: PromptParams,
): string {
  const s = userData.user_settings;
  const parts: string[] = [baseSystemPrompt(), ''];

  parts.push("## User's name", `The user is ${s.name}.`, '');
  if (s.prompt?.trim()) {
    parts.push("## User's prompt", s.prompt.trim(), '');
  }
  if (s.friends?.length) {
    parts.push(
      "## User's friends",
      `The friends of the user are: ${s.friends.join(', ')}`,
      '',
    );
  }
  if (s.additional_keywords?.length) {
    parts.push(
      "## User's frequently used keywords",
      `Words the user uses often (use when relevant): ${s.additional_keywords.join(', ')}`,
      '',
    );
  }

  const documents = (s.documents ?? []).slice(0, MAX_DOCUMENTS);
  if (documents.length) {
    parts.push("## User's documents");
    documents.forEach((doc, i) => {
      const content = doc.content.slice(0, MAX_DOCUMENT_CHARS);
      parts.push(`### Document ${i + 1} "${doc.title}"`, content, '');
    });
  }

  if (s.learn_style) {
    const examples = chosenStyleExamples(userData, MAX_STYLE_EXAMPLES);
    if (examples.length >= 3) {
      parts.push('## How the user likes to phrase things');
      parts.push(
        'Sentences the user actually chose before. Match their tone, vocabulary and length without copying verbatim:',
      );
      examples.forEach((ex) => parts.push(`* ${ex}`));
      parts.push('');
    }
  }

  // Bounded window of previous conversations + the current one (always last).
  const recent = userData.conversations.slice(-(MAX_PAST_CONVERSATIONS + 1));
  const current = userData.conversations[userData.conversations.length - 1];
  let hasPastHeader = false;
  recent.forEach((conversation) => {
    if (conversation.messages.length === 0) return;
    if (conversation === current) {
      parts.push('## Current conversation with the user', '');
      renderConversation(parts, conversation, s.name);
    } else {
      if (!hasPastHeader) {
        parts.push('## Past conversations', '');
        hasPastHeader = true;
      }
      renderConversation(
        parts,
        conversation,
        s.name,
        MAX_MESSAGES_PER_PAST_CONVERSATION,
      );
    }
    parts.push('');
  });

  const [lo, hi] = LENGTH_TO_NB_WORDS[params.desiredLength];
  parts.push(
    '## Desired responses length',
    `Each response should be between ${lo} and ${hi} words long.`,
    '',
  );

  parts.push("## User's keywords and directives to guide your answers", '');
  const { keywords, intent } = params;
  if (intent === 'directive') {
    parts.push(
      `The user has given you a direct instruction for the next responses: "${keywords ?? ''}". ` +
        `Follow this instruction closely to generate ${NB_RESPONSES} suggested responses.`,
      '',
    );
  } else if (keywords || intent) {
    parts.push(
      'The user chose the following keywords and intents to guide the answers:',
    );
    if (keywords) parts.push(`- Keywords: ${keywords}`);
    if (intent) parts.push(`- Intent/Action: ${intent}`);
    parts.push(
      `Use these concepts in all of your ${NB_RESPONSES} suggested responses.`,
      '',
    );
  }

  if (params.initiating) {
    parts.push('## Initiating mode');
    parts.push(
      `The user wants to TAKE THE FLOOR rather than reply. Suggest ${NB_RESPONSES} things ` +
        'the user could SAY to start or steer the conversation.',
    );
    if (params.initiatingTopic) {
      parts.push(
        `The user SPECIFICALLY wants to start a topic about: ${params.initiatingTopic}.`,
      );
    }
  }

  return parts.join('\n');
}

/** The short user turn that asks the model to produce the suggestions now. */
export function buildUserTurn(): string {
  return 'Génère les suggestions maintenant.';
}
