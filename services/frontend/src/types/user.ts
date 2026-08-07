export interface Document {
  title: string;
  content: string;
}

export interface QuickPhrase {
  text: string;
  category: string;
}

export interface Appointment {
  title: string;
  phrases: string[];
}

export interface UserSettings {
  name: string;
  prompt: string;
  additional_keywords: string[];
  friends: string[];
  documents: Document[];
  quick_phrases: QuickPhrase[];
  appointments?: Appointment[];
  voice: string | null;
  expected_transcription_language: string | null;
  accepted_terms_of_services: boolean;
  /** When true, the LLM adapts its suggestions to the user's past phrasings. */
  learn_style?: boolean;
}

export interface UserData {
  email: string;
  user_id?: string;
  is_admin?: boolean;
  user_settings: UserSettings;
  conversations?: unknown[];
  memory?: unknown;
}
