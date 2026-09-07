import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import InvincibleVoice from '../../components/InvincibleVoice';

// The accessories drawer (keywords, friends, appointments) is off-canvas on a
// phone and needs a button to open it. During a session the phone renders the
// focused mobile footer, which had no such button — while the toggle that did
// exist lived in the footer that never runs on mobile. The drawer was
// therefore unreachable on Android, and with it the keyword steering and the
// appointment launcher, which has no other entry point (found 07/09/26).

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

jest.mock('@/utils/userData', () => ({
  getUserData: jest.fn(),
  deleteConversation: jest.fn(),
  isSpeakerMessage: jest.fn(),
  isWriterMessage: jest.fn(),
}));

describe('accessories drawer on a phone', () => {
  const mockGetUserData = jest.fn();

  const mockUserData = {
    user_id: 'test-user-id',
    user_settings: {
      name: 'Test User',
      prompt: 'Test prompt',
      additional_keywords: ['hello', 'goodbye'],
      friends: ['Alice'],
      documents: [],
      quick_phrases: [],
      appointments: [{ title: 'Doctor', phrases: ['Hello'] }],
    },
    conversations: [],
  };

  const setViewportWidth = (width: number) => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: width,
    });
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // jest.setup.js pins a desktop viewport for the whole suite, which is why
    // no test had ever rendered the phone session layout. Narrow it here.
    setViewportWidth(390);

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true, connected: 'yes_request_ok' }),
    });

    mockGetUserData.mockResolvedValue({ data: mockUserData, status: 200 });

    const useWebSocket = require('react-use-websocket').default;
    useWebSocket.mockReturnValue({
      sendMessage: jest.fn(),
      lastMessage: null,
      readyState: 1,
    });

    const { useMicrophoneAccess } = require('@/hooks/useMicrophoneAccess');
    useMicrophoneAccess.mockReturnValue({
      microphoneAccess: 'unknown',
      askMicrophoneAccess: jest.fn().mockResolvedValue({
        getTracks: () => [],
        getAudioTracks: () => [],
        getVideoTracks: () => [],
      }),
    });

    const { useAudioProcessor } = require('@/hooks/useAudioProcessor');
    useAudioProcessor.mockReturnValue({
      setupAudio: jest.fn(),
      shutdownAudio: jest.fn(),
      audioProcessor: { current: null },
    });

    const userData = require('@/utils/userData');
    userData.getUserData.mockImplementation(mockGetUserData);
    userData.isSpeakerMessage.mockImplementation(
      (message: object) => 'speaker' in message,
    );
    userData.isWriterMessage.mockImplementation(
      (message: object) => 'messageId' in message,
    );
  });

  const startSession = async (user: ReturnType<typeof userEvent.setup>) => {
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Start chatting' }),
      ).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: 'Start chatting' }));
    await waitFor(() => {
      expect(screen.getByTitle('Stop conversation')).toBeInTheDocument();
    });
  };

  afterEach(() => {
    setViewportWidth(1280);
  });

  it('can be opened from the session footer', async () => {
    const user = userEvent.setup();
    render(<InvincibleVoice />);
    await startSession(user);

    const toggle = screen.getByRole('button', { name: 'Keywords' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    // The drawer is rendered but hidden until the toggle is pressed.
    const drawer = screen.getByRole('complementary', { hidden: true });
    expect(drawer).toHaveAttribute('aria-hidden', 'true');

    await user.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(drawer).toHaveAttribute('aria-hidden', 'false');
  });
});
