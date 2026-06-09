import { beforeEach, describe } from '@jest/globals';
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

describe('InvincibleVoice Connect Button Tests', () => {
  const mockSendMessage = jest.fn();
  const mockLastMessage = null;
  const mockReadyState = 1; // OPEN

  beforeEach(() => {
    // Mock fetch for health check
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true, connected: 'yes_request_ok' }),
    });

    // Mock useWebSocket
    const useWebSocket = require('react-use-websocket').default;
    useWebSocket.mockReturnValue({
      sendMessage: mockSendMessage,
      lastMessage: mockLastMessage,
      readyState: mockReadyState,
    });

    jest.clearAllMocks();
  });

  test('Connect button activates microphone and establishes WebSocket connection', async () => {
    const user = userEvent.setup();

    // Create a mock media stream that looks like the real thing
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

    render(<InvincibleVoice userId='12345678-1234-4234-8234-123456789012' />);

    // Wait for the component to render and health check to complete
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Start chatting' })).toBeInTheDocument();
    });

    const connectButton = screen.getByRole('button', { name: 'Start chatting' });

    // Click the Start Conversation button
    await user.click(connectButton);

    // Verify microphone access was requested
    expect(mockAskMicrophoneAccess).toHaveBeenCalledTimes(1);

    // Wait for the async operations to complete
    await waitFor(() => {
      // Verify audio setup was called with the media stream object
      expect(mockSetupAudio).toHaveBeenCalledWith(mockMediaStream);
    });

    // Verify the button text changes to "Stop Conversation"
    await waitFor(() => {
      expect(screen.getByTitle('Stop the conversation')).toBeInTheDocument();
    });
  });

  test('Connect button shows error message when microphone access is refused', async () => {
    const user = userEvent.setup();
    const mockAskMicrophoneAccess = jest.fn().mockResolvedValue(null);

    // Mock microphone access being refused
    const { useMicrophoneAccess } = require('@/hooks/useMicrophoneAccess');
    useMicrophoneAccess.mockReturnValue({
      microphoneAccess: 'refused',
      askMicrophoneAccess: mockAskMicrophoneAccess,
    });

    render(<InvincibleVoice userId='12345678-1234-4234-8234-123456789012' />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Start chatting' })).toBeInTheDocument();
    });

    const connectButton = screen.getByRole('button', { name: 'Start chatting' });
    await user.click(connectButton);

    // Verify the error message is shown
    await waitFor(() => {
      expect(
        screen.getByText(
          'Please allow microphone access to use InvincibleVoice.',
        ),
      ).toBeInTheDocument();
    });

    // Verify the button remains as "Start Conversation"
    expect(screen.getByRole('button', { name: 'Start chatting' })).toBeInTheDocument();
  });

  test('Stop Conversation button stops audio and closes WebSocket connection', async () => {
    const user = userEvent.setup();
    const mockShutdownAudio = jest.fn();

    // Create a mock media stream
    const mockMediaStream = {
      getTracks: () => [],
      getAudioTracks: () => [],
      getVideoTracks: () => [],
    };

    // Mock the component in connected state
    const { useMicrophoneAccess } = require('@/hooks/useMicrophoneAccess');
    useMicrophoneAccess.mockReturnValue({
      microphoneAccess: 'granted',
      askMicrophoneAccess: jest.fn().mockResolvedValue(mockMediaStream),
    });

    const { useAudioProcessor } = require('@/hooks/useAudioProcessor');
    useAudioProcessor.mockReturnValue({
      setupAudio: jest.fn(),
      shutdownAudio: mockShutdownAudio,
      audioProcessor: { current: null },
    });

    // Mock WebSocket as connected
    const useWebSocket = require('react-use-websocket').default;
    useWebSocket.mockReturnValue({
      sendMessage: mockSendMessage,
      lastMessage: mockLastMessage,
      readyState: 1, // OPEN
    });

    render(<InvincibleVoice userId='12345678-1234-4234-8234-123456789012' />);

    // First connect
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Start chatting' })).toBeInTheDocument();
    });

    const connectButton = screen.getByRole('button', { name: 'Start chatting' });

    // Clear any previous calls before the actual test
    mockShutdownAudio.mockClear();

    await user.click(connectButton);

    // Wait for connection to be established
    await waitFor(() => {
      expect(screen.getByTitle('Stop the conversation')).toBeInTheDocument();
    });

    // Now click disconnect
    const disconnectButton = screen.getByTitle('Stop the conversation');
    await user.click(disconnectButton);

    // Verify shutdown was called at least once
    expect(mockShutdownAudio).toHaveBeenCalled();

    // Verify button text changes back to "Start Conversation"
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Start chatting' })).toBeInTheDocument();
    });
  });
});
