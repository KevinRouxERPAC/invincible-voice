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

describe('Delete Conversation Tests', () => {
  const mockSendMessage = jest.fn();
  const mockDeleteConversation = jest.fn();
  const mockGetUserData = jest.fn();
  const mockIsSpeakerMessage = jest.fn();
  const mockIsWriterMessage = jest.fn();

  const mockUserData = {
    user_id: 'test-user-id',
    user_settings: {
      name: 'Test User',
      prompt: 'Test prompt',
      additional_keywords: ['test', 'keyword'],
      friends: ['friend1', 'friend2'],
      documents: [],
    },
    conversations: [
      {
        messages: [
          { speaker: 'user', content: 'Hello' },
          { content: 'Hi there!', messageId: 'msg1' },
        ],
        start_time: '2025-07-06T10:00:00.000Z',
      },
      {
        messages: [
          { speaker: 'user', content: 'How are you?' },
          { content: 'I am doing well!', messageId: 'msg2' },
        ],
        start_time: '2025-07-06T12:00:00.000Z',
      },
      {
        messages: [
          { speaker: 'user', content: 'Goodbye' },
          { content: 'See you later!', messageId: 'msg3' },
        ],
        start_time: '2025-07-06T14:00:00.000Z',
      },
    ],
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock fetch for health check
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true, connected: 'yes_request_ok' }),
    });

    // Mock useWebSocket
    const useWebSocket = require('react-use-websocket').default;
    useWebSocket.mockReturnValue({
      sendMessage: mockSendMessage,
      lastMessage: null,
      readyState: 1, // OPEN
    });

    // Mock getUserData
    mockGetUserData.mockResolvedValue({
      data: mockUserData,
      status: 200,
    });

    // Mock deleteConversation
    mockDeleteConversation.mockResolvedValue({
      status: 200,
    });

    // Mock type guard functions
    mockIsSpeakerMessage.mockImplementation((message) => 'speaker' in message);
    mockIsWriterMessage.mockImplementation((message) => 'messageId' in message);

    // Set up userData module mocks
    const userData = require('@/utils/userData');
    userData.getUserData.mockImplementation(mockGetUserData);
    userData.deleteConversation.mockImplementation(mockDeleteConversation);
    userData.isSpeakerMessage.mockImplementation(mockIsSpeakerMessage);
    userData.isWriterMessage.mockImplementation(mockIsWriterMessage);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should display delete buttons for each conversation', async () => {
    render(<InvincibleVoice userId='test-user-id' />);

    // Wait for user data to load
    await waitFor(() => {
      expect(mockGetUserData).toHaveBeenCalled();
    });

    // Wait for conversations to appear
    await waitFor(() => {
      expect(screen.getByText('Hello')).toBeInTheDocument();
    });

    // Check that delete buttons are present (they should be visible as X icons)
    const deleteButtons = screen.getAllByTitle('Delete conversation');
    expect(deleteButtons).toHaveLength(3); // Should have 3 delete buttons for 3 conversations
  });

  it('should show confirmation dialog when delete button is clicked', async () => {
    const user = userEvent.setup();
    render(<InvincibleVoice userId='test-user-id' />);

    // Wait for user data to load
    await waitFor(() => {
      expect(mockGetUserData).toHaveBeenCalled();
    });

    // Wait for conversations to appear
    await waitFor(() => {
      expect(screen.getByText('Hello')).toBeInTheDocument();
    });

    // Click on the first delete button
    const deleteButtons = screen.getAllByTitle('Delete conversation');
    await user.click(deleteButtons[0]);

    // Check that confirmation dialog appears
    await waitFor(() => {
      expect(screen.getByText('Delete conversation')).toBeInTheDocument();
      expect(
        screen.getByText(
          'Are you sure you want to delete this conversation? This action cannot be undone.',
        ),
      ).toBeInTheDocument();
      expect(screen.getByText('Delete')).toBeInTheDocument();
      expect(screen.getByText('Cancel')).toBeInTheDocument();
    });
  });

  it('should cancel deletion when cancel button is clicked', async () => {
    const user = userEvent.setup();
    render(<InvincibleVoice userId='test-user-id' />);

    // Wait for user data to load
    await waitFor(() => {
      expect(mockGetUserData).toHaveBeenCalled();
    });

    // Wait for conversations to appear
    await waitFor(() => {
      expect(screen.getByText('Hello')).toBeInTheDocument();
    });

    // Click on the first delete button
    const deleteButtons = screen.getAllByTitle('Delete conversation');
    await user.click(deleteButtons[0]);

    // Wait for confirmation dialog
    await waitFor(() => {
      expect(screen.getByText('Delete conversation')).toBeInTheDocument();
    });

    // Click cancel
    const cancelButton = screen.getByText('Cancel');
    await user.click(cancelButton);

    // Check that dialog disappears and no deletion occurred
    await waitFor(() => {
      expect(screen.queryByText('Delete conversation')).not.toBeInTheDocument();
    });

    expect(mockDeleteConversation).not.toHaveBeenCalled();
  });

  it('should delete conversation when confirmed', async () => {
    const user = userEvent.setup();
    render(<InvincibleVoice userId='test-user-id' />);

    // Wait for user data to load
    await waitFor(() => {
      expect(mockGetUserData).toHaveBeenCalled();
    });

    // Wait for conversations to appear
    await waitFor(() => {
      expect(screen.getByText('Hello')).toBeInTheDocument();
    });

    // Click on the first delete button (this should be the last conversation in the reversed list)
    const deleteButtons = screen.getAllByTitle('Delete conversation');
    await user.click(deleteButtons[0]);

    // Wait for confirmation dialog
    await waitFor(() => {
      expect(screen.getByText('Delete conversation')).toBeInTheDocument();
    });

    // Click delete to confirm
    const deleteButton = screen.getByRole('button', { name: 'Delete' });
    await user.click(deleteButton);

    // Check that API was called with correct parameters
    await waitFor(() => {
      expect(mockDeleteConversation).toHaveBeenCalledWith(2); // Last conversation index
    });

    // Check that dialog disappears
    await waitFor(() => {
      expect(screen.queryByText('Delete conversation')).not.toBeInTheDocument();
    });
  });

  it('should handle deletion error gracefully', async () => {
    const user = userEvent.setup();

    // Mock deleteConversation to return an error
    mockDeleteConversation.mockResolvedValue({
      error: 'Failed to delete conversation: 500 Internal Server Error',
      status: 500,
    });

    render(<InvincibleVoice userId='test-user-id' />);

    // Wait for user data to load
    await waitFor(() => {
      expect(mockGetUserData).toHaveBeenCalled();
    });

    // Wait for conversations to appear
    await waitFor(() => {
      expect(screen.getByText('Hello')).toBeInTheDocument();
    });

    // Click on the first delete button
    const deleteButtons = screen.getAllByTitle('Delete conversation');
    await user.click(deleteButtons[0]);

    // Wait for confirmation dialog
    await waitFor(() => {
      expect(screen.getByText('Delete conversation')).toBeInTheDocument();
    });

    // Click delete to confirm
    const deleteButton = screen.getByRole('button', { name: 'Delete' });
    await user.click(deleteButton);

    // Check that API was called
    await waitFor(() => {
      expect(mockDeleteConversation).toHaveBeenCalled();
    });

    // Check that dialog disappears
    await waitFor(() => {
      expect(screen.queryByText('Delete conversation')).not.toBeInTheDocument();
    });

    // The error should be handled internally (added to errors state)
    // We can't easily test the error message display without more complex mocking
  });

  it('should close dialog when clicking the X button', async () => {
    const user = userEvent.setup();
    render(<InvincibleVoice userId='test-user-id' />);

    // Wait for user data to load
    await waitFor(() => {
      expect(mockGetUserData).toHaveBeenCalled();
    });

    // Wait for conversations to appear
    await waitFor(() => {
      expect(screen.getByText('Hello')).toBeInTheDocument();
    });

    // Click on the first delete button
    const deleteButtons = screen.getAllByTitle('Delete conversation');
    await user.click(deleteButtons[0]);

    // Wait for confirmation dialog
    await waitFor(() => {
      expect(screen.getByText('Delete conversation')).toBeInTheDocument();
    });

    // Click the X button to close
    const closeButton = screen.getByLabelText('Close');
    await user.click(closeButton);

    // Check that dialog disappears and no deletion occurred
    await waitFor(() => {
      expect(screen.queryByText('Delete conversation')).not.toBeInTheDocument();
    });

    expect(mockDeleteConversation).not.toHaveBeenCalled();
  });
});
