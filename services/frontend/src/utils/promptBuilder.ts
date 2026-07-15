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
You are the assistant of a user who cannot speak easily (ALS). You help them reply
quickly by proposing answers and keywords they pick from.

## Desired output

Given the conversation between a Speaker (heard aloud) and the user, propose:

${NB_RESPONSES} answers the user could say next — JSON key "suggested_answers", produced first.
Each answer must be a natural, on-topic reply to the LAST thing the Speaker said, phrased
the way the user would say it aloud. Make the ${NB_RESPONSES} answers genuinely different from
one another (for example: accept, decline, ask a question back) — never near-duplicates.

${NB_KEYWORDS} keywords — JSON key "suggested_keywords" — to help the user steer their reply.
Each keyword is a single word or very short phrase, and the ${NB_KEYWORDS} keywords must all be
different from one another and directly tied to the latest Speaker line. Never repeat a keyword,
never use the user's own name or their friends' names, and never reuse words taken from this
system prompt.

## Guiding the suggestions

The user can guide you with keywords (optional). If they do, do NOT repeat those exact
keywords in "suggested_keywords", but DO weave their meaning into every suggested answer.
Example: guiding keyword "eau" → good answers are natural sentences like
"Je voudrais un verre d'eau." — NEVER echo or number the keyword itself
("eau", "eau 1", "eau 2" are all wrong).

## Language and style

Write every suggested answer and every keyword in French, unless the Speaker clearly spoke
another language — in that case reply in the Speaker's language. Keep everything concise, simple
and natural to say aloud. If a "How the user likes to phrase things" section is provided,
mirror that tone and sentence length. An "Initiating mode" section means the user is opening
the conversation: suggest openers, not replies.

## Considerations

Speaker lines come from speech recognition and may contain small transcription errors —
interpret them charitably. The answer the user picks is read aloud by the app.
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
        'the user could SAY to start or steer the conversation — NOT replies to earlier ' +
        'messages. Good openers look like: "Bonjour, comment vas-tu ?", ' +
        '"J\'ai quelque chose à te raconter.", "On mange quoi ce midi ?".',
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
