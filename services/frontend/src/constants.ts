// UnmuteConfigurator types
export type LanguageCode = 'en' | 'fr' | 'en/fr' | 'fr/en';

export type ConstantInstructions = {
  type: 'constant';
  text: string;
  language?: LanguageCode;
};

export type Instructions =
  | ConstantInstructions
  | { type: 'smalltalk'; language?: LanguageCode }
  | { type: 'guess_animal'; language?: LanguageCode }
  | { type: 'quiz_show'; language?: LanguageCode }
  | { type: 'invincible_voice'; language?: LanguageCode };

export type UnmuteConfig = {
  instructions: Instructions;
  voice: string;
  // The backend doesn't care about this, we use it for analytics
  voiceName: string;
  // The backend doesn't care about this, we use it for analytics
  isCustomInstructions: boolean;
};

// Hardcoded Olivier voice from voices.yaml
export const DEFAULT_UNMUTE_CONFIG: UnmuteConfig = {
  instructions: {
    type: 'invincible_voice',
    language: 'fr',
  },
  voice: 'unmute-prod-website/developer-1.mp3',
  voiceName: 'Olivier',
  isCustomInstructions: false,
};

export const STATIC_MESSAGES = {
  CONTEXT_QUESTION:
    'Tu peux donner ton prénom pour aider le logiciel à comprendre le contexte? Merci!',
  REPEAT_QUESTION: "Peux-tu répéter ? Le logiciel n'a pas très bien compris.",
} as const;
export const STATIC_MESSAGE_UUIDS = {
  CONTEXT_QUESTION: '00000000-0000-4000-8000-000000000001',
  REPEAT_QUESTION: '00000000-0000-4000-8000-000000000002',
} as const;

export const RESPONSES_SIZES = {
  XS: 'XS',
  S: 'S',
  M: 'M',
  L: 'L',
  XL: 'XL',
} as const;
export const ORDERED_RESPONSE_SIZES = [
  RESPONSES_SIZES.XS,
  RESPONSES_SIZES.S,
  RESPONSES_SIZES.M,
  RESPONSES_SIZES.L,
  RESPONSES_SIZES.XL,
] as const;

// Number of LLM-generated responses and keywords shown per turn.
// Must match the backend constants NB_RESPONSES / NB_KEYWORDS in kyutai_constants.py.
export const NB_RESPONSES = 3;
export const NB_KEYWORDS = 6;
type ResponseSizeKeys = keyof typeof RESPONSES_SIZES;
export type ResponseSize = (typeof RESPONSES_SIZES)[ResponseSizeKeys];
