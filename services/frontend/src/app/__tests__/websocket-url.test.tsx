import { render, act } from '@testing-library/react';
import InvincibleVoice from '../../components/InvincibleVoice';

// jest.setup.js mocks authUtils with an anonymous user (no token). This suite
// asserts how an authenticated user is identified, so it needs a real token.
jest.mock('@/auth/authUtils', () => ({
  ...jest.requireActual('@/auth/authUtils'),
  getBearerToken: () => 'test-bearer-token',
  getAuthHeaders: () => ({ Authorization: 'Bearer test-bearer-token' }),
  addAuthHeaders: (headers = {}) => ({
    ...headers,
    Authorization: 'Bearer test-bearer-token',
  }),
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

  // The URL is passed to react-use-websocket as a getter: it is resolved when
  // a connection is actually opened, so every conversation gets its own
  // `local_time` (which the backend stores as the conversation's start_time).
  const findNewConversationCall = () => {
    const useWebSocket = require('react-use-websocket').default;
    return useWebSocket.mock.calls.find(
      (call) =>
        typeof call[0] === 'function' &&
        call[0]().includes('/new-conversation?local_time='),
    );
  };

  /** The URL react-use-websocket would connect to for this render. */
  const newConversationUrl = () => {
    const call = findNewConversationCall();
    return call ? call[0]() : undefined;
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

    // Verify that useWebSocket resolves the correct URL
    expect(newConversationUrl()).toBe(
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
    expect(newConversationUrl()).toBe(
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
    expect(newConversationUrl()).not.toMatch(/user_id=/);
    const options = urlCall[1];
    expect(options.protocols).toEqual(
      expect.arrayContaining(['realtime', expect.stringMatching(/^Bearer\./)]),
    );
  });

  it('should create a new timestamp for each connection, not once per render', async () => {
    // `local_time` becomes the conversation's start_time. Computing it once
    // per component instance stamped every conversation of one app run with
    // the app's launch time, and the history showed several entries at the
    // same minute (found on device 07/09/26).
    let callCount = 0;
    jest.spyOn(Date.prototype, 'toISOString').mockImplementation(() => {
      callCount += 1;
      return `2025-07-07T13:30:0${callCount}.000Z`;
    });

    await act(async () => {
      render(<InvincibleVoice />);
    });

    const call = findNewConversationCall();
    expect(call).toBeDefined();

    // Two connections from the same mounted component: two timestamps.
    const first = call[0]();
    const second = call[0]();
    expect(first).not.toBe(second);
    expect(first).toMatch(/local_time=2025-07-07T13%3A30%3A0\d\.000Z/);
    expect(second).toMatch(/local_time=2025-07-07T13%3A30%3A0\d\.000Z/);
  });

  it('should keep the local_time parameter in the WebSocket URL', async () => {
    await act(async () => {
      render(<InvincibleVoice />);
    });

    expect(newConversationUrl()).toMatch(/local_time=/);
    expect(newConversationUrl()).toMatch(/2025-07-07T13%3A30%3A00\.000Z/);
  });
});
