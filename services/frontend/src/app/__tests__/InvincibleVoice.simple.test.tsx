import { expect, test, describe, beforeEach } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Import component after mocks
import InvincibleVoice from '../../components/InvincibleVoice';

// Mock all hooks and dependencies before importing the component
const mockSendMessage = jest.fn();
const mockAskMicrophoneAccess = jest.fn();
const mockSetupAudio = jest.fn();
const mockShutdownAudio = jest.fn();

jest.mock('react-use-websocket', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    sendMessage: mockSendMessage,
    lastMessage: null,
    readyState: 1, // OPEN
  })),
  ReadyState: {
    CONNECTING: 0,
    OPEN: 1,
    CLOSING: 2,
    CLOSED: 3,
  },
}));

jest.mock('@/hooks/useMicrophoneAccess', () => ({
  useMicrophoneAccess: jest.fn(() => ({
    microphoneAccess: 'unknown',
    askMicrophoneAccess: mockAskMicrophoneAccess,
  })),
}));

jest.mock('@/hooks/useAudioProcessor', () => ({
  useAudioProcessor: jest.fn(() => ({
    setupAudio: mockSetupAudio,
    shutdownAudio: mockShutdownAudio,
    audioProcessor: { current: null },
  })),
}));

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

describe('InvincibleVoice Core Functionality Tests', () => {
  beforeEach(() => {
    // Mock fetch for health check and user data
    global.fetch = jest.fn().mockImplementation((url: string) => {
      if (url.includes('/v1/health')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({ ok: true, connected: 'yes_request_ok' }),
        });
      }
      if (url.includes('/v1/user/')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              user_id: '12345678-1234-4234-8234-123456789012',
              user_settings: {
                name: 'Test User',
                prompt: 'Test prompt',
                additional_keywords: ['test', 'keyword'],
                friends: ['friend1', 'friend2'],
                documents: [],
              },
              conversations: [],
            }),
        });
      }
      if (url.includes('/v1/tts')) {
        return Promise.resolve({
          ok: true,
          blob: () =>
            Promise.resolve(new Blob(['mock-audio'], { type: 'audio/wav' })),
        });
      }
      return Promise.reject(new Error('Unknown URL'));
    });

    // Reset mocks
    jest.clearAllMocks();

    // Reset mock implementations
    mockAskMicrophoneAccess.mockResolvedValue({
      getTracks: () => [],
      getAudioTracks: () => [],
      getVideoTracks: () => [],
    });
  });

  test('Connect button is rendered and clickable', async () => {
    render(<InvincibleVoice />);

    // Wait for health check to complete
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Start chatting' }),
      ).toBeInTheDocument();
    });

    const connectButton = screen.getByRole('button', {
      name: 'Start chatting',
    });
    expect(connectButton).toBeEnabled();
  });

  test('Connect button activates microphone access', async () => {
    const user = userEvent.setup();
    render(<InvincibleVoice />);

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Start chatting' }),
      ).toBeInTheDocument();
    });

    const connectButton = screen.getByRole('button', {
      name: 'Start chatting',
    });
    await user.click(connectButton);

    // Verify microphone access was requested
    expect(mockAskMicrophoneAccess).toHaveBeenCalledTimes(1);
  });

  test('Successful connection shows stop button in right pane', async () => {
    const user = userEvent.setup();

    // Mock successful microphone access
    mockAskMicrophoneAccess.mockResolvedValue({
      getTracks: () => [],
      getAudioTracks: () => [],
      getVideoTracks: () => [],
    });

    render(<InvincibleVoice />);

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Start chatting' }),
      ).toBeInTheDocument();
    });

    const connectButton = screen.getByRole('button', {
      name: 'Start chatting',
    });
    await user.click(connectButton);

    // Wait for connection to be established (stop button appears in right pane)
    await waitFor(
      () => {
        expect(
          screen.getByRole('button', { name: 'Stop conversation' }),
        ).toBeInTheDocument();
      },
      { timeout: 3000 },
    );
  });

  test('Microphone refusal shows error message', async () => {
    // Mock the hook to return refused state
    // eslint-disable-next-line global-require
    const { useMicrophoneAccess } = require('@/hooks/useMicrophoneAccess');
    useMicrophoneAccess.mockReturnValue({
      microphoneAccess: 'refused',
      askMicrophoneAccess: jest.fn().mockResolvedValue(null),
    });

    render(<InvincibleVoice />);

    await waitFor(() => {
      expect(
        screen.getByText(
          'Please allow microphone access to use InvincibleVoice.',
        ),
      ).toBeInTheDocument();
    });
  });

  test('Response options are displayed with waiting state', async () => {
    render(<InvincibleVoice />);

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Start chatting' }),
      ).toBeInTheDocument();
    });

    // Check that response options are not shown when not connected
    expect(screen.queryByText('Waiting for response…')).not.toBeInTheDocument();

    // Check option keyboard shortcuts are also not shown when not connected
    expect(screen.queryByText('A')).not.toBeInTheDocument();
    expect(screen.queryByText('Z')).not.toBeInTheDocument();
    expect(screen.queryByText('Q')).not.toBeInTheDocument();
    expect(screen.queryByText('S')).not.toBeInTheDocument();
  });
});
