import { render, act } from '@testing-library/react';
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

describe('WebSocket URL Construction Tests', () => {
  const mockSendMessage = jest.fn();
  const mockGetUserData = jest.fn();

  const mockUserData = {
    user_id: 'test-user-id',
    user_settings: {
      name: 'Test User',
      prompt: 'Test prompt',
      additional_keywords: ['test', 'keyword'],
      friends: ['friend1', 'friend2'],
      documents: [],
    },
    conversations: [],
  };

  const findNewConversationCall = () => {
    const useWebSocket = require('react-use-websocket').default;
    return useWebSocket.mock.calls.find(
      (call) => call[0] && call[0].includes('/new-conversation?local_time='),
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

    // Mock Date.now() for consistent testing
    jest
      .spyOn(Date.prototype, 'toISOString')
      .mockReturnValue('2025-07-07T13:30:00.000Z');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should construct WebSocket URL with local_time parameter', async () => {
    await act(async () => {
      render(<InvincibleVoice />);
    });

    // Verify that useWebSocket was called with the correct URL
    const urlCall = findNewConversationCall();
    expect(urlCall).toBeDefined();
    expect(urlCall[0]).toBe(
      'http://localhost:8000/v1/user/new-conversation?local_time=2025-07-07T13%3A30%3A00.000Z',
    );
  });

  it('should properly encode special characters in local_time', async () => {
    // Mock a date with more special characters that need encoding
    jest
      .spyOn(Date.prototype, 'toISOString')
      .mockReturnValue('2025-07-07T13:30:00.123+05:30');

    await act(async () => {
      render(<InvincibleVoice />);
    });

    // Verify that special characters are properly encoded
    const urlCall = findNewConversationCall();
    expect(urlCall).toBeDefined();
    expect(urlCall[0]).toBe(
      'http://localhost:8000/v1/user/new-conversation?local_time=2025-07-07T13%3A30%3A00.123%2B05%3A30',
    );
  });

  it('should authenticate through WebSocket subprotocols, not the URL', async () => {
    await act(async () => {
      render(<InvincibleVoice />);
    });

    const urlCall = findNewConversationCall();
    expect(urlCall).toBeDefined();

    // The user identity is sent as a Bearer token subprotocol; the URL itself
    // contains no user identifier
    expect(urlCall[0]).not.toMatch(/user_id=/);
    const options = urlCall[1];
    expect(options.protocols).toEqual(
      expect.arrayContaining([
        'realtime',
        expect.stringMatching(/^Bearer\./),
      ]),
    );
  });

  it('should create a new timestamp each time the component is rendered', async () => {
    let callCount = 0;
    jest.spyOn(Date.prototype, 'toISOString').mockImplementation(() => {
      callCount++;
      return `2025-07-07T13:30:0${callCount}.000Z`;
    });

    // Render first instance
    let unmount;
    await act(async () => {
      const result = render(<InvincibleVoice />);
      unmount = result.unmount;
    });

    const useWebSocket = require('react-use-websocket').default;
    let urlCall = findNewConversationCall();
    expect(urlCall).toBeDefined();
    expect(urlCall[0]).toBe(
      'http://localhost:8000/v1/user/new-conversation?local_time=2025-07-07T13%3A30%3A01.000Z',
    );

    unmount();
    useWebSocket.mockClear();

    // Render second instance
    await act(async () => {
      render(<InvincibleVoice />);
    });

    urlCall = findNewConversationCall();
    expect(urlCall).toBeDefined();
    expect(urlCall[0]).toBe(
      'http://localhost:8000/v1/user/new-conversation?local_time=2025-07-07T13%3A30%3A02.000Z',
    );
  });

  it('should keep the local_time parameter in the WebSocket URL', async () => {
    await act(async () => {
      render(<InvincibleVoice />);
    });

    const urlCall = findNewConversationCall();
    expect(urlCall).toBeDefined();
    expect(urlCall[0]).toMatch(/local_time=/);
    expect(urlCall[0]).toMatch(/2025-07-07T13%3A30%3A00\.000Z/);
  });
});
