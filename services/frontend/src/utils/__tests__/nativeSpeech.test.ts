/**
 * Regression test for the "silent voice" bug found live on the S25+:
 * SpeechRecognition.stop() can hang forever (its promise never settles when
 * the recognizer already died on a NO_MATCH). speakNative() awaits
 * listening.suspend() BEFORE speaking, so a stuck stop() used to block every
 * TTS output during a conversation — typed messages and selected suggestions
 * were never spoken. The fix races stop() against a short timeout.
 */
import { startNativeListening, speakNative } from '../nativeSpeech';

jest.mock('@capacitor-community/speech-recognition', () => ({
  SpeechRecognition: {
    start: jest.fn(() => Promise.resolve()),
    // The pathological case: a stop() whose promise NEVER settles.
    stop: jest.fn(() => new Promise(() => {})),
    isListening: jest.fn(() => Promise.resolve({ listening: false })),
    addListener: jest.fn(() => Promise.resolve({ remove: jest.fn() })),
    removeAllListeners: jest.fn(() => Promise.resolve()),
  },
}));

jest.mock('@capacitor-community/text-to-speech', () => ({
  TextToSpeech: {
    speak: jest.fn(() => Promise.resolve()),
    stop: jest.fn(() => Promise.resolve()),
  },
  QueueStrategy: { Flush: 0 },
}));

jest.mock('@/utils/platform', () => ({
  isNativeApp: jest.fn(() => true),
}));

const { TextToSpeech } = jest.requireMock(
  '@capacitor-community/text-to-speech',
);
const { SpeechRecognition } = jest.requireMock(
  '@capacitor-community/speech-recognition',
);

describe('speakNative with active listening', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('still speaks when SpeechRecognition.stop() never settles', async () => {
    // Arm an active listening session so speakNative goes through suspend().
    const controller = await startNativeListening({
      language: 'fr-FR',
      onPartial: () => {},
      onUtterance: () => {},
    });

    const speaking = speakNative({
      text: 'Je voudrais boire un café',
      messageId: 'm1',
      lang: 'fr-FR',
    });

    // The suspend timeout must release the voice even though stop() hangs.
    await jest.advanceTimersByTimeAsync(1000);
    await speaking;

    expect(SpeechRecognition.stop).toHaveBeenCalled();
    expect(TextToSpeech.speak).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'Je voudrais boire un café' }),
    );

    // Cleanup must not hang either (stop() also races nothing here, but the
    // controller.stop awaits the same hung promise — cap the wait).
    const stopping = controller.stop();
    await jest.advanceTimersByTimeAsync(1000);
    await Promise.race([stopping, Promise.resolve()]);
  });

  it('speaks immediately when there is no active listening', async () => {
    await speakNative({ text: 'Bonjour', messageId: 'm2' });
    expect(TextToSpeech.speak).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'Bonjour' }),
    );
  });
});
