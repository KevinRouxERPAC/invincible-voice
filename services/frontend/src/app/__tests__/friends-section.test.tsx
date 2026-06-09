import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import InvincibleVoice from '../../components/InvincibleVoice';

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

// Mock userData functions
jest.mock('@/utils/userData', () => ({
  getUserData: jest.fn(),
  deleteConversation: jest.fn(),
  isSpeakerMessage: jest.fn(),
  isWriterMessage: jest.fn(),
}));

describe('Friends Section Tests', () => {
  const mockSendMessage = jest.fn();
  const mockGetUserData = jest.fn();

  const mockUserData = {
    user_id: 'test-user-id',
    user_settings: {
      name: 'Test User',
      prompt: 'Test prompt',
      additional_keywords: ['hello', 'goodbye'],
      friends: ['Alice', 'Bob', 'Charlie'],
      documents: [],
    },
    conversations: [],
  };

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
    jest.clearAllMocks();

    // Mock fetch for health check
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true, connected: 'yes_request_ok' }),
    });

    // Mock getUserData
    mockGetUserData.mockResolvedValue({
      data: mockUserData,
      status: 200,
    });

    // Mock useWebSocket
    const useWebSocket = require('react-use-websocket').default;
    useWebSocket.mockReturnValue({
      sendMessage: mockSendMessage,
      lastMessage: null,
      readyState: 1, // OPEN
    });

    // Mock type guard functions
    const userData = require('@/utils/userData');
    userData.getUserData.mockImplementation(mockGetUserData);
    userData.isSpeakerMessage.mockImplementation(
      (message) => 'speaker' in message,
    );
    userData.isWriterMessage.mockImplementation(
      (message) => 'messageId' in message,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('renders friends section with friend names', async () => {
    const user = userEvent.setup();
    setupConnectionMocks();

    render(<InvincibleVoice userId='test-user-123' />);

    await establishConnection(user);

    // Wait for friends section to render by checking for a friend name
    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeInTheDocument();
    });

    // Check if all friends are displayed
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText('Charlie')).toBeInTheDocument();
  });

  test('displays empty state when no friends are configured', async () => {
    const user = userEvent.setup();
    setupConnectionMocks();

    // Mock user data without friends
    mockGetUserData.mockResolvedValue({
      data: {
        ...mockUserData,
        user_settings: {
          ...mockUserData.user_settings,
          friends: [],
          documents: [],
        },
      },
      status: 200,
    });

    render(<InvincibleVoice userId='test-user-123' />);

    await establishConnection(user);

    await waitFor(() => {
      expect(screen.getByText(/No friends added yet/)).toBeInTheDocument();
    });
  });

  test('adds friend name to text input when friend bubble is clicked', async () => {
    const user = userEvent.setup();
    setupConnectionMocks();

    render(<InvincibleVoice userId='test-user-123' />);

    await establishConnection(user);

    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeInTheDocument();
    });

    const textInput = screen.getByPlaceholderText('Type your message here…');

    // Click on Alice friend bubble
    const aliceButton = screen.getByText('Alice');
    await user.click(aliceButton);

    // Check if Alice was added to the text input
    expect(textInput).toHaveValue('Alice');
  });

  test('appends friend name to existing text when friend bubble is clicked', async () => {
    const user = userEvent.setup();
    setupConnectionMocks();

    render(<InvincibleVoice userId='test-user-123' />);

    await establishConnection(user);

    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeInTheDocument();
    });

    const textInput = screen.getByPlaceholderText('Type your message here…');

    // Type some initial text
    await user.type(textInput, 'Hello ');

    // Click on Bob friend bubble
    const bobButton = screen.getByText('Bob');
    await user.click(bobButton);

    // Check if Bob was appended to the existing text
    expect(textInput).toHaveValue('Hello  Bob');
  });

  test('sends CurrentKeywords message when friend is clicked', async () => {
    const user = userEvent.setup();
    setupConnectionMocks();

    render(<InvincibleVoice userId='test-user-123' />);

    await establishConnection(user);

    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeInTheDocument();
    });

    // Clear any previous calls
    mockSendMessage.mockClear();

    // Click on Charlie friend bubble
    const charlieButton = screen.getByText('Charlie');
    await user.click(charlieButton);

    // Verify CurrentKeywords message was sent with friend name
    await waitFor(() => {
      expect(mockSendMessage).toHaveBeenCalledWith(
        JSON.stringify({
          type: 'current.keywords',
          keywords: 'Charlie',
        }),
      );
    });
  });

  test('friend buttons have correct styling', async () => {
    const user = userEvent.setup();
    setupConnectionMocks();

    render(<InvincibleVoice userId='test-user-123' />);

    await establishConnection(user);

    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeInTheDocument();
    });

    const aliceButton = screen.getByText('Alice').closest('button');

    // Check if the button has the blue gradient styling (different from the
    // green-tinted response options)
    expect(aliceButton).toHaveClass('blue-to-light-blue-gradient');
  });

  test('friends section and quick words section are both visible', async () => {
    const user = userEvent.setup();
    setupConnectionMocks();

    render(<InvincibleVoice userId='test-user-123' />);

    await establishConnection(user);

    await waitFor(() => {
      expect(screen.getByText('hello')).toBeInTheDocument();
      expect(screen.getByText('Alice')).toBeInTheDocument();
    });

    // Check both sections have their content
    expect(screen.getByText('hello')).toBeInTheDocument(); // Quick word
    expect(screen.getByText('Alice')).toBeInTheDocument(); // Friend
  });

  test('clicking multiple friends appends them with spaces', async () => {
    const user = userEvent.setup();
    setupConnectionMocks();

    render(<InvincibleVoice userId='test-user-123' />);

    await establishConnection(user);

    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeInTheDocument();
    });

    const textInput = screen.getByPlaceholderText('Type your message here…');

    // Click on multiple friends
    await user.click(screen.getByText('Alice'));
    await user.click(screen.getByText('Bob'));
    await user.click(screen.getByText('Charlie'));

    // Check if all friends were added with spaces
    expect(textInput).toHaveValue('Alice Bob Charlie');
  });
});
