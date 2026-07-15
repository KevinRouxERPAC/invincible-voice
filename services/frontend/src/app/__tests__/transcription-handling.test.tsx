import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import InvincibleVoice from '../../components/InvincibleVoice';

// Mock WebSocket. The component receives server messages through the
// onMessage callback passed to useWebSocket, so we capture it to be able
// to simulate incoming messages.
const mockSendMessage = jest.fn();
let mockOnMessage: ((event: { data: string }) => void) | undefined;

jest.mock('react-use-websocket', () => ({
  __esModule: true,
  default: jest.fn(
    (url: string, options: { onMessage?: typeof mockOnMessage }) => {
      mockOnMessage = options?.onMessage;
      return {
        sendMessage: mockSendMessage,
        lastMessage: null,
        readyState: 1, // OPEN
      };
    },
  ),
  ReadyState: {
    CONNECTING: 0,
    OPEN: 1,
    CLOSING: 2,
    CLOSED: 3,
  },
}));

// Mock all the hooks
jest.mock('@/hooks/useMicrophoneAccess');
jest.mock('@/hooks/useAudioProcessor');

jest.mock('@/hooks/useKeyboardShortcuts', () => ({
  __esModule: true,
  default: () => ({ isDevMode: false }),
}));

jest.mock('@/hooks/useWakeLock', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('@/hooks/useBackendServerUrl', () => ({
  useBackendServerUrl: () => 'http://localhost:8000',
}));

describe('InvincibleVoice Transcription Message Handling Tests', () => {
  const sendServerMessage = async (payload: Record<string, unknown>) => {
    await act(async () => {
      mockOnMessage?.({ data: JSON.stringify(payload) });
    });
  };

  // The transcription bubble is only rendered inside the chat interface,
  // which is shown once a conversation has been started.
  const establishConnection = async (user) => {
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Start chatting' }),
      ).toBeInTheDocument();
    });

    const startButton = screen.getByRole('button', { name: 'Start chatting' });
    await user.click(startButton);

    await waitFor(
      () => {
        expect(screen.getByTitle('Stop conversation')).toBeInTheDocument();
      },
      { timeout: 3000 },
    );
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockOnMessage = undefined;

    // Mock fetch for health check and TTS (similar to working tests)
    global.fetch = jest.fn().mockImplementation((url) => {
      if (url.includes('/v1/health')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({ ok: true, connected: 'yes_request_ok' }),
        });
      }
      if (url.includes('/v1/tts')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ sample_rate: 24000 }),
          blob: () =>
            Promise.resolve(new Blob(['mock-audio'], { type: 'audio/wav' })),
        });
      }
      return Promise.reject(new Error('Unknown URL'));
    });
  });

  test('transcription delta messages update the current speaker message bubble', async () => {
    const user = userEvent.setup();
    render(<InvincibleVoice />);

    await establishConnection(user);

    // Simulate receiving a transcription delta message
    await sendServerMessage({
      type: 'conversation.item.input_audio_transcription.delta',
      delta: 'Hello',
      event_id: 'event-1',
    });

    // Check that the transcription appears in the interface
    await waitFor(
      () => {
        expect(screen.getByText('Hello')).toBeInTheDocument();
      },
      { timeout: 3000 },
    );

    // Simulate receiving another delta message
    await sendServerMessage({
      type: 'conversation.item.input_audio_transcription.delta',
      delta: 'world',
      event_id: 'event-2',
    });

    // Check that the text is appended (with space)
    await waitFor(
      () => {
        expect(screen.getByText('Hello world')).toBeInTheDocument();
      },
      { timeout: 3000 },
    );
  });

  test('multiple transcription delta messages update the same text bubble progressively', async () => {
    const user = userEvent.setup();
    render(<InvincibleVoice />);

    await establishConnection(user);

    // Simulate multiple delta messages coming in sequence
    const deltaMessages = [
      { delta: 'This', event_id: 'event-1' },
      { delta: 'is', event_id: 'event-2' },
      { delta: 'a', event_id: 'event-3' },
      { delta: 'test', event_id: 'event-4' },
    ];

    let expectedText = '';

    for (const deltaMsg of deltaMessages) {
      expectedText += (expectedText.length > 0 ? ' ' : '') + deltaMsg.delta;

      await sendServerMessage({
        type: 'conversation.item.input_audio_transcription.delta',
        delta: deltaMsg.delta,
        event_id: deltaMsg.event_id,
      });

      await waitFor(
        () => {
          expect(screen.getByText(expectedText)).toBeInTheDocument();
        },
        { timeout: 3000 },
      );
    }

    // Final text should be the complete sentence
    expect(screen.getByText('This is a test')).toBeInTheDocument();
  });

  test('transcription moves to the chat history when responses arrive', async () => {
    const user = userEvent.setup();
    render(<InvincibleVoice />);

    await establishConnection(user);

    // First, simulate receiving transcription
    await sendServerMessage({
      type: 'conversation.item.input_audio_transcription.delta',
      delta: 'Hello there',
      event_id: 'event-1',
    });

    await waitFor(
      () => {
        expect(screen.getByText('Hello there')).toBeInTheDocument();
      },
      { timeout: 3000 },
    );

    // Now simulate receiving the one.response message which should clear
    // the current transcription and move it to chat history
    await sendServerMessage({
      type: 'one.response',
      content: 'Response option 1',
      timestamp: new Date().toISOString(),
      index: 0,
    });

    // The transcription should now be in the chat history as a user message
    await waitFor(
      () => {
        expect(screen.getByText('Hello there')).toBeInTheDocument();
      },
      { timeout: 3000 },
    );

    // The response option should be visible
    await waitFor(
      () => {
        expect(screen.getByText('Response option 1')).toBeInTheDocument();
      },
      { timeout: 3000 },
    );
  });

  test('duplicate messages with same event_id are not processed twice', async () => {
    const user = userEvent.setup();
    render(<InvincibleVoice />);

    await establishConnection(user);

    // Send the same message twice with the same event_id
    const duplicateMessage = {
      type: 'conversation.item.input_audio_transcription.delta',
      delta: 'Single message',
      event_id: 'duplicate-event',
    };

    // First time
    await sendServerMessage(duplicateMessage);

    await waitFor(
      () => {
        expect(screen.getByText('Single message')).toBeInTheDocument();
      },
      { timeout: 3000 },
    );

    // Second time - same event_id, should be ignored
    await sendServerMessage(duplicateMessage);

    // Should still only appear once: the delta was not appended a second time
    expect(screen.getByText('Single message')).toBeInTheDocument();
    expect(
      screen.queryByText('Single message Single message'),
    ).not.toBeInTheDocument();
  });
});
