import { jest } from '@jest/globals';

export const useAudioProcessor = jest.fn(() => ({
  setupAudio: jest.fn(),
  shutdownAudio: jest.fn(),
  audioProcessor: { current: null },
}));
