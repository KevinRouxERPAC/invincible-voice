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
  default: jest.fn((url: string, options: { onMessage?: typeof mockOnMessage }) => {
    mockOnMessage = options?.onMessage;
    return {
      sendMessage: mockSendMessage,
      lastMessage: null,
      readyState: 1, // OPEN
    };
  }),
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

describe('InvincibleVoice Response Handling and TTS Tests', () => {
  const sendServerMessage = async (payload: Record<string, unknown>) => {
    await act(async () => {
      mockOnMessage?.({ data: JSON.stringify(payload) });
    });
  };

  const countTtsCalls = () =>
    (global.fetch as jest.Mock).mock.calls.filter(
      (call) => call[0] && call[0].includes('/v1/tts'),
    ).length;

  // Helper function to establish connection like the working tests
  const setupConnectionMocks = () => {
    const mockMediaStream = {
      getTracks: () => [],
      getAudioTracks: () => [],
      getVideoTracks: () => [],
    };

    const mockAskMicrophoneAccess = jest
      .fn()
      .mockResolvedValue(mockMediaStream);
    const mockSetupAudio = jest.fn();

    // Mock the hooks with our spy functions
    const { useMicrophoneAccess } = require('@/hooks/useMicrophoneAccess');
    useMicrophoneAccess.mockReturnValue({
      microphoneAccess: 'unknown',
      askMicrophoneAccess: mockAskMicrophoneAccess,
    });

    const { useAudioProcessor } = require('@/hooks/useAudioProcessor');
    useAudioProcessor.mockReturnValue({
      setupAudio: mockSetupAudio,
      shutdownAudio: jest.fn(),
      audioProcessor: { current: null },
    });

    return { mockAskMicrophoneAccess, mockSetupAudio };
  };

  const establishConnection = async (user) => {
    // Wait for start button and click it to establish connection
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Start chatting' })).toBeInTheDocument();
    });

    const startButton = screen.getByRole('button', { name: 'Start chatting' });
    await user.click(startButton);

    // Wait for the connection UI to appear
    await waitFor(
      () => {
        expect(screen.getByTitle('Stop the conversation')).toBeInTheDocument();
      },
      { timeout: 3000 },
    );
  };

  beforeEach(() => {
    // Clear all mocks including fetch
    jest.clearAllMocks();
    mockOnMessage = undefined;

    // Mock fetch for the health check and the streaming TTS endpoints
    global.fetch = jest.fn().mockImplementation((url) => {
      if (url.includes('/v1/health')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({ ok: true, connected: 'yes_request_ok' }),
        });
      }
      if (url.includes('/v1/tts/sample_rate')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ sample_rate: 24000 }),
        });
      }
      if (url.includes('/v1/tts')) {
        const read = jest
          .fn()
          .mockResolvedValueOnce({ value: new Uint8Array(8), done: false })
          .mockResolvedValue({ value: undefined, done: true });
        return Promise.resolve({
          ok: true,
          body: { getReader: () => ({ read }) },
        });
      }
      return Promise.reject(new Error('Unknown URL'));
    });

    // Web Audio mock supporting the streaming playback path
    global.AudioContext = jest.fn().mockImplementation(() => ({
      createBuffer: jest.fn(() => ({
        copyToChannel: jest.fn(),
        duration: 0.1,
      })),
      createBufferSource: jest.fn(() => ({
        connect: jest.fn(),
        start: jest.fn(),
        buffer: null,
      })),
      destination: {},
      currentTime: 0,
    })) as unknown as typeof AudioContext;
  });

  afterEach(() => {
    // Clean up any side effects
    jest.clearAllMocks();
  });

  test('one.response messages populate response boxes progressively', async () => {
    const user = userEvent.setup();
    setupConnectionMocks();

    render(<InvincibleVoice />);

    await establishConnection(user);

    // Simulate receiving one.response messages progressively
    const responses = [
      'Yes, I agree with that point.',
      'No, I think differently about this.',
      "That's an interesting perspective.",
    ];
    for (let i = 0; i < responses.length; i++) {
      await sendServerMessage({
        type: 'one.response',
        content: responses[i],
        timestamp: new Date().toISOString(),
        index: i,
      });
    }

    // Check that all 3 response options are populated
    await waitFor(
      () => {
        expect(
          screen.getByText('Yes, I agree with that point.'),
        ).toBeInTheDocument();
        expect(
          screen.getByText('No, I think differently about this.'),
        ).toBeInTheDocument();
        expect(
          screen.getByText("That's an interesting perspective."),
        ).toBeInTheDocument();
      },
      { timeout: 3000 },
    );

    // Completed responses are selectable (the buttons are enabled)
    const responseButtons = screen.getAllByRole('button');
    const responseBoxes = responseButtons.filter(
      (button) =>
        button.textContent?.includes('Yes, I agree') ||
        button.textContent?.includes('No, I think') ||
        button.textContent?.includes("That's an interesting"),
    );
    expect(responseBoxes).toHaveLength(3);
    responseBoxes.forEach((box) => {
      expect(box).toBeEnabled();
    });
  });

  test('receiving responses does not trigger TTS requests', async () => {
    const user = userEvent.setup();
    setupConnectionMocks();

    render(<InvincibleVoice />);

    await establishConnection(user);

    // Record initial TTS call count
    const initialTtsCount = countTtsCalls();

    // Send 3 responses
    for (let i = 0; i < 3; i++) {
      await sendServerMessage({
        type: 'one.response',
        content: `Response ${i + 1}`,
        timestamp: new Date(Date.now() + 1000).toISOString(),
        index: i,
      });
    }

    // Wait for the responses to be processed
    await waitFor(
      () => {
        expect(screen.getByText('Response 1')).toBeInTheDocument();
      },
      { timeout: 3000 },
    );

    // TTS is only requested when the user selects a response, never on arrival
    expect(countTtsCalls()).toBe(initialTtsCount);
  });

  test('response selection triggers WebSocket message and audio playback', async () => {
    const user = userEvent.setup();
    setupConnectionMocks();

    render(<InvincibleVoice />);

    await establishConnection(user);

    // Send responses message
    await sendServerMessage({
      type: 'one.response',
      content: 'I will choose this response',
      timestamp: new Date(Date.now() + 2000).toISOString(),
      index: 0,
    });

    await waitFor(
      () => {
        expect(
          screen.getByText('I will choose this response'),
        ).toBeInTheDocument();
      },
      { timeout: 3000 },
    );

    // Find and click the first response
    const firstResponse = screen
      .getByText('I will choose this response')
      .closest('button');
    expect(firstResponse).toBeInTheDocument();

    await user.click(firstResponse!);

    // Verify WebSocket message was sent
    expect(mockSendMessage).toHaveBeenCalledWith(
      expect.stringMatching(/"type":"response\.selected\.by\.writer"/),
    );
    expect(mockSendMessage).toHaveBeenCalledWith(
      expect.stringMatching(/"text":"I will choose this response"/),
    );
    expect(mockSendMessage).toHaveBeenCalledWith(
      expect.stringMatching(/"id":"[0-9a-f-]{36}"/),
    );

    // Verify a streaming TTS request was made for the selected response
    await waitFor(
      () => {
        expect(global.fetch).toHaveBeenCalledWith(
          '/api/v1/tts/',
          expect.objectContaining({
            method: 'POST',
            body: expect.stringMatching(
              /"text":"I will choose this response"/,
            ),
          }),
        );
      },
      { timeout: 3000 },
    );

    // Also verify the message id was included
    await waitFor(
      () => {
        expect(global.fetch).toHaveBeenCalledWith(
          '/api/v1/tts/',
          expect.objectContaining({
            body: expect.stringMatching(/"message_id":"[0-9a-f-]{36}"/),
          }),
        );
      },
      { timeout: 3000 },
    );

    // Verify audio playback was attempted through the Web Audio API
    await waitFor(
      () => {
        expect(global.AudioContext).toHaveBeenCalled();
      },
      { timeout: 3000 },
    );
  });

  test('response options are hidden when not connected', async () => {
    render(<InvincibleVoice />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Start chatting' })).toBeInTheDocument();
    });

    // Response boxes should NOT be shown when not connected
    expect(
      screen.queryByText('Waiting for response…'),
    ).not.toBeInTheDocument();

    // Only settings and start conversation button should be visible
    expect(screen.getByRole('button', { name: 'Start chatting' })).toBeInTheDocument();
  });
});
