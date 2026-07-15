// On-device LLM abstraction for the native (Android) app.
//
// The whole point of the 100%-local mode: instead of asking the backend (and,
// behind it, a cloud LLM) for suggested answers, we run a small quantized model
// directly on the phone. This module defines the *interface* the rest of the
// app talks to, plus a stub used until the native llama.cpp plugin is wired in.
//
// The native implementation (a Capacitor plugin around llama.cpp) will plug in
// behind `getLocalLlm()` without any change to the callers: same
// `generate(...)` contract, streaming the two fields
// { suggested_answers, suggested_keywords } — exactly the shape the backend's
// StructuredLLMResponse used to return.

import { NB_KEYWORDS, NB_RESPONSES } from '@/constants';
import { LlamaCpp } from '@/plugins/llamaCpp';
import { isNativeApp } from '@/utils/platform';

/** The structured result a generation produces (mirror of the backend schema). */
export interface StructuredSuggestions {
  suggested_answers: string[];
  suggested_keywords: string[];
}

/** Optional streaming callbacks so the UI can show answers as they complete. */
export interface GenerateHandlers {
  /** Called once an answer at `index` is fully generated. */
  onAnswer?: (index: number, text: string) => void;
  /** Called once a keyword at `index` is fully generated. */
  onKeyword?: (index: number, text: string) => void;
  /** Aborts generation (e.g. the user spoke again before we finished). */
  signal?: AbortSignal;
}

export interface GenerateInput {
  /** Fully-built system prompt (see promptBuilder). */
  system: string;
  /** The user turn that asks for the suggestions. */
  user: string;
}

/** A pluggable on-device LLM engine. */
export interface LocalLlm {
  /** Whether the engine is ready (model downloaded + loaded). */
  isReady(): Promise<boolean>;
  /**
   * Generate the structured suggestions. Implementations should stream via
   * `handlers` when possible, and always resolve with the full result.
   */
  generate(
    input: GenerateInput,
    handlers?: GenerateHandlers,
  ): Promise<StructuredSuggestions>;
}

// The JSON schema the native engine constrains generation with (GBNF grammar).
// Field order matters: answers first so they stream before the keywords.
export const SUGGESTIONS_SCHEMA = {
  type: 'object',
  properties: {
    suggested_answers: {
      type: 'array',
      items: { type: 'string' },
      minItems: NB_RESPONSES,
      maxItems: NB_RESPONSES,
    },
    suggested_keywords: {
      type: 'array',
      items: { type: 'string' },
      minItems: NB_KEYWORDS,
      maxItems: NB_KEYWORDS,
    },
  },
  required: ['suggested_answers', 'suggested_keywords'],
} as const;

/**
 * Placeholder engine used until the native llama.cpp plugin is available.
 *
 * It produces deterministic, obviously-fake suggestions so the whole offline
 * pipeline (prompt building, event plumbing, UI) can be exercised on an
 * emulator with no model present. It intentionally does NOT look smart — it is
 * only here to prove the wiring, and is replaced by the real engine.
 */
export const stubLocalLlm: LocalLlm = {
  isReady(): Promise<boolean> {
    return Promise.resolve(true);
  },

  generate(
    input: GenerateInput,
    handlers?: GenerateHandlers,
  ): Promise<StructuredSuggestions> {
    // Derive a tiny bit of context from the user turn so the placeholder is
    // recognizably tied to the conversation during manual testing.
    const hint = input.user.slice(0, 40).replace(/\s+/g, ' ').trim();
    const answers = [
      `(local) D'accord${hint ? `, à propos de « ${hint} »` : ''}.`,
      '(local) Oui, avec plaisir.',
      '(local) Je ne suis pas sûr, laisse-moi réfléchir.',
    ].slice(0, NB_RESPONSES);
    const keywords = [
      'oui',
      'non',
      'plus tard',
      'merci',
      'peut-être',
      'répète',
    ].slice(0, NB_KEYWORDS);

    // Emulate streaming: reveal one item at a time so the UI behaves like it
    // will with the real (token-streaming) engine.
    answers.forEach((text, i) => {
      setTimeout(
        () => {
          if (!handlers?.signal?.aborted) handlers?.onAnswer?.(i, text);
        },
        120 * (i + 1),
      );
    });
    keywords.forEach((text, i) => {
      setTimeout(
        () => {
          if (!handlers?.signal?.aborted) handlers?.onKeyword?.(i, text);
        },
        500 + 40 * i,
      );
    });

    return Promise.resolve({
      suggested_answers: answers,
      suggested_keywords: keywords,
    });
  },
};

// GBNF grammar hand-written for our fixed schema: an object with exactly
// NB_RESPONSES answers and NB_KEYWORDS keywords, all JSON strings. This forces
// the on-device model to emit valid, correctly-sized JSON with zero retries.
export const SUGGESTIONS_GBNF = [
  'root ::= "{" ws "\\"suggested_answers\\"" ws ":" ws answers ws "," ws "\\"suggested_keywords\\"" ws ":" ws keywords ws "}"',
  `answers ::= "[" ws string ( ws "," ws string ){${NB_RESPONSES - 1}} ws "]"`,
  `keywords ::= "[" ws string ( ws "," ws string ){${NB_KEYWORDS - 1}} ws "]"`,
  'string ::= "\\"" char{3,120} "\\""',
  // Positive char class (printable ASCII minus " and \, plus accented Latin).
  // A NEGATED class ([^"\\]) is pathologically slow with the grammar sampler on
  // large-vocab models (Qwen ~151k tokens) — this keeps sampling fast.
  'char ::= [\\x20-\\x21\\x23-\\x5B\\x5D-\\x7E\\u00C0-\\u00FF]',
  'ws ::= [ \\t\\n]*',
].join('\n');

let nativeModelLoaded = false;

/**
 * Load a GGUF model into the native engine. Called once the model file is
 * present on the device (download-on-first-run). Safe to call again to swap.
 */
export async function loadNativeModel(
  path: string,
  opts: { threads?: number; nCtx?: number } = {},
): Promise<boolean> {
  const { loaded } = await LlamaCpp.loadModel({
    path,
    threads: opts.threads ?? 6,
    nCtx: opts.nCtx ?? 2048,
  });
  nativeModelLoaded = loaded;
  return loaded;
}

/** Accent- and case-insensitive key, to catch "sélection"/"selection" dupes. */
function keywordKey(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/**
 * Parse the model's JSON and clean it up. The 1.5B on-device model regularly
 * emits near-duplicate keywords ("peux-tu"/"Peux-tu", "sélection"/"selection")
 * despite prompt instructions, so deduplication has to happen in code.
 * Exported for tests.
 */
export function parseSuggestions(text: string): StructuredSuggestions {
  const data = JSON.parse(text) as Partial<StructuredSuggestions>;
  const seen = new Set<string>();
  const keywords: string[] = [];
  (data.suggested_keywords ?? []).forEach((raw) => {
    const keyword = (raw ?? '').trim();
    const key = keywordKey(keyword);
    if (keyword && !seen.has(key) && keywords.length < NB_KEYWORDS) {
      seen.add(key);
      keywords.push(keyword);
    }
  });
  return {
    suggested_answers: (data.suggested_answers ?? []).slice(0, NB_RESPONSES),
    suggested_keywords: keywords,
  };
}

/** Real on-device engine backed by the native llama.cpp plugin. */
export const nativeLocalLlm: LocalLlm = {
  async isReady(): Promise<boolean> {
    if (!isNativeApp()) return false;
    try {
      const { loaded } = await LlamaCpp.isLoaded();
      nativeModelLoaded = loaded;
      return loaded;
    } catch {
      return false;
    }
  },

  async generate(
    input: GenerateInput,
    handlers?: GenerateHandlers,
  ): Promise<StructuredSuggestions> {
    const { text } = await LlamaCpp.generate({
      prompt: `${input.system}\n\n${input.user}`,
      grammar: SUGGESTIONS_GBNF,
      temperature: 0.7,
      maxTokens: 200,
    });
    if (handlers?.signal?.aborted) {
      return { suggested_answers: [], suggested_keywords: [] };
    }
    const result = parseSuggestions(text);
    result.suggested_answers.forEach((t, i) => handlers?.onAnswer?.(i, t));
    result.suggested_keywords.forEach((t, i) => handlers?.onKeyword?.(i, t));
    return result;
  },
};

/** Whether the stub may stand in for a real model (emulator / pipeline tests). */
export function isStubEnabled(): boolean {
  return process.env.NEXT_PUBLIC_LOCAL_STUB === '1';
}

/**
 * The on-device LLM engine to use, or null when none is available.
 *
 * Returns the native llama.cpp engine once a model is loaded. It falls back to
 * the stub only when explicitly asked for (NEXT_PUBLIC_LOCAL_STUB=1): shipping
 * the stub to a real user would surface obviously-fake suggestions, which is
 * worse than telling them the offline engine is not ready.
 */
export function getLocalLlm(): LocalLlm | null {
  if (isNativeApp() && nativeModelLoaded) {
    return nativeLocalLlm;
  }
  if (isStubEnabled()) {
    return stubLocalLlm;
  }
  return null;
}
