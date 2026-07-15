// Capacitor binding for the native on-device llama.cpp plugin
// (see android/app/src/main/java/.../LlamaCppPlugin.kt).

import { registerPlugin } from '@capacitor/core';

export interface LoadModelOptions {
  /** Absolute path to a GGUF model file on the device. */
  path: string;
  /** CPU threads for generation (default 6). */
  threads?: number;
  /** Context window in tokens (default 2048). */
  nCtx?: number;
}

export interface GenerateOptions {
  prompt: string;
  /** Optional GBNF grammar constraining the output (root = "root"). */
  grammar?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface LlamaCppPlugin {
  isLoaded(): Promise<{ loaded: boolean }>;
  loadModel(options: LoadModelOptions): Promise<{ loaded: boolean }>;
  generate(options: GenerateOptions): Promise<{ text: string }>;
}

export const LlamaCpp = registerPlugin<LlamaCppPlugin>('LlamaCpp');
