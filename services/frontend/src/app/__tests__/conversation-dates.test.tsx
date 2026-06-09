import { render, screen } from '@testing-library/react';
import ConversationHistory from '../../components/conversations/ConversationHistory';

describe('ConversationHistory Date Display', () => {
  const todayStartTime = new Date().toISOString();
  const mockConversations = [
    {
      messages: [
        { speaker: 'user', content: 'Hello from today' },
        { content: 'Hi there!', messageId: 'msg1' },
      ],
      start_time: todayStartTime, // Today
    },
    {
      messages: [
        { speaker: 'user', content: 'Hello from yesterday' },
        { content: 'Hi there!', messageId: 'msg2' },
      ],
      start_time: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // Yesterday
    },
    {
      messages: [
        { speaker: 'user', content: 'Hello from last week' },
        { content: 'Hi there!', messageId: 'msg3' },
      ],
      start_time: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), // Last week
    },
  ];

  it('should display conversation dates correctly', () => {
    render(
      <ConversationHistory
        conversations={mockConversations}
        selectedConversationIndex={null}
        onConversationSelect={() => {}}
        onNewConversation={() => {}}
        onDeleteConversation={() => {}}
      />,
    );

    // Check that conversation content is displayed
    expect(screen.getByText('Hello from today')).toBeInTheDocument();
    expect(screen.getByText('Hello from yesterday')).toBeInTheDocument();
    expect(screen.getByText('Hello from last week')).toBeInTheDocument();

    // Check that "Yesterday" appears for the yesterday conversation
    expect(screen.getByText('Yesterday')).toBeInTheDocument();

    // Check that today shows time, formatted the same way as the component
    // (locale-dependent, e.g. "02:30 PM" or "14:30")
    const expectedTime = new Date(todayStartTime).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
    expect(screen.getByText(expectedTime)).toBeInTheDocument();
  });

  it('should sort conversations by most recent first', () => {
    render(
      <ConversationHistory
        conversations={mockConversations}
        selectedConversationIndex={null}
        onConversationSelect={() => {}}
        onNewConversation={() => {}}
        onDeleteConversation={() => {}}
      />,
    );

    // Get all conversation content elements
    const conversationElements = screen.getAllByText(/Hello from/);

    // Should be sorted with most recent (today) first
    expect(conversationElements[0]).toHaveTextContent('Hello from today');
    expect(conversationElements[1]).toHaveTextContent('Hello from yesterday');
    expect(conversationElements[2]).toHaveTextContent('Hello from last week');
  });

  it('should handle conversations without start_time gracefully', () => {
    const conversationsWithoutTime = [
      {
        messages: [
          { speaker: 'user', content: 'Hello without time' },
          { content: 'Hi there!', messageId: 'msg1' },
        ],
        // Missing start_time field
      } as any,
    ];

    render(
      <ConversationHistory
        conversations={conversationsWithoutTime}
        selectedConversationIndex={null}
        onConversationSelect={() => {}}
        onNewConversation={() => {}}
        onDeleteConversation={() => {}}
      />,
    );

    // Should still display the conversation content
    expect(screen.getByText('Hello without time')).toBeInTheDocument();

    // Should not crash and should show the message count badge
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('should handle invalid date strings gracefully', () => {
    const conversationsWithInvalidDate = [
      {
        messages: [
          { speaker: 'user', content: 'Hello with invalid date' },
          { content: 'Hi there!', messageId: 'msg1' },
        ],
        start_time: 'invalid-date-string',
      },
    ];

    // Spy on console.warn to check if warning is logged
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    render(
      <ConversationHistory
        conversations={conversationsWithInvalidDate}
        selectedConversationIndex={null}
        onConversationSelect={() => {}}
        onNewConversation={() => {}}
        onDeleteConversation={() => {}}
      />,
    );

    // Should still display the conversation content
    expect(screen.getByText('Hello with invalid date')).toBeInTheDocument();

    // Should log warning about invalid date
    expect(consoleSpy).toHaveBeenCalledWith(
      'Failed to parse conversation start_time:',
      'invalid-date-string',
    );

    consoleSpy.mockRestore();
  });
});
