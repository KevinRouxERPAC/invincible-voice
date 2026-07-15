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

// Mock other hooks
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

describe('Response Handling and TTS Tests', () => {
  const sendServerMessage = async (payload: Record<string, unknown>) => {
    await act(async () => {
      mockOnMessage?.({ data: JSON.stringify(payload) });
    });
  };

  const countTtsCalls = () =>
    (global.fetch as jest.Mock).mock.calls.filter((call) =>
      call[0].includes('/v1/tts'),
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
      expect(
        screen.getByRole('button', { name: 'Start chatting' }),
      ).toBeInTheDocument();
    });

    const startButton = screen.getByRole('button', { name: 'Start chatting' });
    await user.click(startButton);

    // Wait for the connection UI to appear
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

    // Mock fetch for health check and the streaming TTS endpoints
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

  test('one.response messages populate response boxes progressively', async () => {
    const user = userEvent.setup();
    setupConnectionMocks();

    render(<InvincibleVoice />);

    await establishConnection(user);

    // Send one.response messages progressively
    const responses = [
      'Yes, I agree with that.',
      'No, I disagree.',
      'Could you clarify?',
    ];

    for (let i = 0; i < responses.length; i++) {
      await sendServerMessage({
        type: 'one.response',
        content: responses[i],
        timestamp: new Date().toISOString(),
        index: i,
      });
    }

    // Check that all responses are displayed
    await waitFor(
      () => {
        expect(screen.getByText('Yes, I agree with that.')).toBeInTheDocument();
        expect(screen.getByText('No, I disagree.')).toBeInTheDocument();
        expect(screen.getByText('Could you clarify?')).toBeInTheDocument();
      },
      { timeout: 3000 },
    );
  });

  test('response interface is simplified when not connected', async () => {
    render(<InvincibleVoice />);

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Start chatting' }),
      ).toBeInTheDocument();
    });

    // Response boxes are not shown when not connected
    expect(screen.queryByText('Waiting for response…')).not.toBeInTheDocument();

    // Only essential buttons are shown
    expect(
      screen.getByRole('button', { name: 'Start chatting' }),
    ).toBeInTheDocument();

    // Response-related UI elements are not visible
    expect(screen.queryByText('A')).not.toBeInTheDocument();
    expect(screen.queryByText('Z')).not.toBeInTheDocument();
  });

  test('TTS requests are made only when responses are clicked', async () => {
    const user = userEvent.setup();
    setupConnectionMocks();

    render(<InvincibleVoice />);

    await establishConnection(user);

    const initialTtsCount = countTtsCalls();

    // Send a response
    await sendServerMessage({
      type: 'one.response',
      content: 'First response',
      timestamp: new Date().toISOString(),
      index: 0,
    });

    await waitFor(
      () => {
        expect(screen.getByText('First response')).toBeInTheDocument();
      },
      { timeout: 3000 },
    );

    // Receiving a response must not trigger any TTS request by itself
    expect(countTtsCalls()).toBe(initialTtsCount);

    // Click the response
    const responseButton = screen.getByText('First response').closest('button');
    await user.click(responseButton!);

    // Verify that clicking the response triggers a streaming TTS request
    await waitFor(
      () => {
        expect(global.fetch).toHaveBeenCalledWith(
          '/api/v1/tts/',
          expect.objectContaining({
            method: 'POST',
            body: expect.stringMatching(/"text":"First response"/),
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

    // Verify that the total TTS count increased after the click
    expect(countTtsCalls()).toBeGreaterThan(initialTtsCount);
  });

  test('clicking response sends WebSocket message', async () => {
    const user = userEvent.setup();
    setupConnectionMocks();

    render(<InvincibleVoice />);

    await establishConnection(user);

    // Send responses progressively
    const responses = [
      'Clickable response',
      'Another response',
      'Third response',
    ];
    for (let i = 0; i < responses.length; i++) {
      await sendServerMessage({
        type: 'one.response',
        content: responses[i],
        timestamp: new Date(Date.now() + 2000).toISOString(),
        index: i,
      });
    }

    await waitFor(
      () => {
        expect(screen.getByText('Clickable response')).toBeInTheDocument();
      },
      { timeout: 3000 },
    );

    // Find and click the first response
    const firstResponseButton = screen
      .getByText('Clickable response')
      .closest('button');
    expect(firstResponseButton).toBeInTheDocument();

    await user.click(firstResponseButton!);

    // Verify WebSocket message was sent
    expect(mockSendMessage).toHaveBeenCalledWith(
      expect.stringMatching(/"type":"response\.selected\.by\.writer"/),
    );
    expect(mockSendMessage).toHaveBeenCalledWith(
      expect.stringMatching(/"text":"Clickable response"/),
    );
    expect(mockSendMessage).toHaveBeenCalledWith(
      expect.stringMatching(/"id":"[0-9a-f-]{36}"/),
    );
  });

  test('response boxes are hidden when not connected', async () => {
    render(<InvincibleVoice />);

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Start chatting' }),
      ).toBeInTheDocument();
    });

    // Check that response boxes are not shown when not connected
    expect(screen.queryByText('Waiting for response…')).not.toBeInTheDocument();

    // Only the start conversation and settings buttons should be visible
    expect(
      screen.getByRole('button', { name: 'Start chatting' }),
    ).toBeInTheDocument();
  });
});
