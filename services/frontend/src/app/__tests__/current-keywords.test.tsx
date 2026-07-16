import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import InvincibleVoice from '../../components/InvincibleVoice';

// Mock WebSocket
jest.mock('react-use-websocket', () => ({
  __esModule: true,
  default: jest.fn(),
  ReadyState: {
    CONNECTING: 0,
    OPEN: 1,
    CLOSING: 2,
    CLOSED: 3,
  },
}));

// Mock the custom hooks
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

describe('CurrentKeywords Message Tests', () => {
  const mockSendMessage = jest.fn();
  const mockLastMessage = null;
  const mockReadyState = 1; // OPEN

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
    // Mock fetch for health check and TTS
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
          blob: () =>
            Promise.resolve(new Blob(['mock audio'], { type: 'audio/wav' })),
        });
      }
      if (url.includes('/v1/user/')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              user_id: 'test-user-id',
              user_settings: {
                name: 'Test User',
                prompt: 'Test prompt',
                additional_keywords: [],
                friends: ['friend1', 'friend2'],
                documents: [],
              },
              conversations: [],
            }),
        });
      }
      return Promise.reject(new Error('Unknown URL'));
    });

    // Reset localStorage mock
    const localStorageMock = {
      getItem: jest.fn(),
      setItem: jest.fn(),
    };
    Object.defineProperty(window, 'localStorage', {
      value: localStorageMock,
      writable: true,
    });

    // Mock useWebSocket
    const useWebSocket = require('react-use-websocket').default;
    useWebSocket.mockReturnValue({
      sendMessage: mockSendMessage,
      lastMessage: mockLastMessage,
      readyState: mockReadyState,
    });

    // Mock microphone access
    const { useMicrophoneAccess } = require('@/hooks/useMicrophoneAccess');
    useMicrophoneAccess.mockReturnValue({
      microphoneAccess: 'granted',
      askMicrophoneAccess: jest.fn(),
    });

    // Mock audio processor
    const { useAudioProcessor } = require('@/hooks/useAudioProcessor');
    useAudioProcessor.mockReturnValue({
      setupAudio: jest.fn(),
      shutdownAudio: jest.fn(),
      audioProcessor: { current: null },
    });

    jest.clearAllMocks();
  });

  test('sends CurrentKeywords message when word is completed with space', async () => {
    const user = userEvent.setup();

    // Set up mocks for connection like the working test
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

    await act(async () => {
      render(<InvincibleVoice userId='12345678-1234-4234-8234-123456789012' />);
    });

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

    // Now the text input should be available
    await waitFor(() => {
      expect(
        screen.getByPlaceholderText('Type your message here…'),
      ).toBeInTheDocument();
    });

    const textInput = screen.getByPlaceholderText('Type your message here…');

    // Type a word followed by space
    await user.type(textInput, 'hello ');

    // Verify CurrentKeywords message was sent
    await waitFor(() => {
      expect(mockSendMessage).toHaveBeenCalledWith(
        JSON.stringify({
          type: 'current.keywords',
          keywords: 'hello',
        }),
      );
    });
  });

  test('sends CurrentKeywords with null when Send button is clicked', async () => {
    const user = userEvent.setup();
    setupConnectionMocks();

    await act(async () => {
      render(<InvincibleVoice userId='12345678-1234-4234-8234-123456789012' />);
    });

    await establishConnection(user);

    await waitFor(() => {
      expect(
        screen.getByPlaceholderText('Type your message here…'),
      ).toBeInTheDocument();
    });

    const textInput = screen.getByPlaceholderText('Type your message here…');
    const sendButton = screen.getByText('Send');

    // Type some text
    await user.type(textInput, 'hello world');

    // Clear any previous calls
    mockSendMessage.mockClear();

    // Click send button
    await user.click(sendButton);

    // Verify CurrentKeywords with null was sent
    await waitFor(() => {
      expect(mockSendMessage).toHaveBeenCalledWith(
        JSON.stringify({
          type: 'current.keywords',
          keywords: null,
        }),
      );
    });
  });

  test('does not send duplicate CurrentKeywords messages', async () => {
    // Use fake timers so the 2s debounce in handleTextInputChange is fully
    // under our control: typing "world" (no trailing space) must not fire a
    // new current.keywords message until the debounce elapses, and when it
    // does it must carry the full text — never a duplicate of the previous
    // "hello".
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    setupConnectionMocks();

    await act(async () => {
      render(<InvincibleVoice userId='12345678-1234-4234-8234-123456789012' />);
    });

    await establishConnection(user);

    await waitFor(() => {
      expect(
        screen.getByPlaceholderText('Type your message here…'),
      ).toBeInTheDocument();
    });

    const textInput = screen.getByPlaceholderText('Type your message here…');

    // Type a word followed by space -> immediate current.keywords('hello').
    await user.type(textInput, 'hello ');

    await waitFor(() => {
      expect(mockSendMessage).toHaveBeenCalledWith(
        JSON.stringify({
          type: 'current.keywords',
          keywords: 'hello',
        }),
      );
    });

    // Clear previous calls.
    mockSendMessage.mockClear();

    // Continue typing without a space. Nothing should fire immediately...
    await user.type(textInput, 'world');

    const immediateKeywordCalls = mockSendMessage.mock.calls.filter((call) =>
      call[0].includes('"type":"current.keywords"'),
    );
    expect(immediateKeywordCalls).toHaveLength(0);

    // ...and even after the debounce elapses, only the full "hello world"
    // is sent (never a duplicate "hello").
    act(() => {
      jest.advanceTimersByTime(3000);
    });

    const keywordCalls = mockSendMessage.mock.calls.filter((call) =>
      call[0].includes('"type":"current.keywords"'),
    );
    expect(keywordCalls).toHaveLength(1);
    expect(keywordCalls[0][0]).toContain('"keywords":"hello world"');

    jest.useRealTimers();
  });

  test('clears text input when Send button is clicked', async () => {
    const user = userEvent.setup();
    setupConnectionMocks();

    await act(async () => {
      render(<InvincibleVoice userId='12345678-1234-4234-8234-123456789012' />);
    });

    await establishConnection(user);

    await waitFor(() => {
      expect(
        screen.getByPlaceholderText('Type your message here…'),
      ).toBeInTheDocument();
    });

    const textInput = screen.getByPlaceholderText('Type your message here…');
    const sendButton = screen.getByText('Send');

    // Type some text
    await user.type(textInput, 'hello world');

    // Verify text is in the input
    expect(textInput).toHaveValue('hello world');

    // Click send button
    await user.click(sendButton);

    // Verify text input is cleared
    await waitFor(() => {
      expect(textInput).toHaveValue('');
    });
  });

  test('displays message when no keywords are available', async () => {
    const user = userEvent.setup();
    setupConnectionMocks();

    await act(async () => {
      render(<InvincibleVoice userId='12345678-1234-4234-8234-123456789012' />);
    });

    await establishConnection(user);

    // Since userData has no additional_keywords, should show empty message
    await waitFor(() => {
      expect(screen.getByText(/No keywords added yet/)).toBeInTheDocument();
    });
  });

  test('displays empty state when userData is not available', async () => {
    const user = userEvent.setup();
    setupConnectionMocks();

    await act(async () => {
      render(<InvincibleVoice userId='12345678-1234-4234-8234-123456789012' />);
    });

    await establishConnection(user);

    // Should show empty state message
    await waitFor(() => {
      expect(screen.getByText(/No keywords added yet/)).toBeInTheDocument();
    });
  });

  test('shows quick words section with empty state', async () => {
    const user = userEvent.setup();
    setupConnectionMocks();

    await act(async () => {
      render(<InvincibleVoice userId='12345678-1234-4234-8234-123456789012' />);
    });

    await establishConnection(user);

    // Should show empty state since no keywords are loaded
    await waitFor(() => {
      expect(screen.getByText(/No keywords added yet/)).toBeInTheDocument();
    });
  });
});
