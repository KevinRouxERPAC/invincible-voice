import { render, screen } from '@testing-library/react';

import MobileConversationLayout from '@/components/mobile/MobileConversationLayout';
import { RESPONSES_SIZES } from '@/constants';
import { I18nProvider } from '@/i18n/I18nContext';

jest.mock('@/components/mobile/ChatPanel', () => ({
  __esModule: true,
  default: () => <div data-testid='chat-panel' />,
}));
jest.mock('@/components/mobile/ResponsePanel', () => ({
  __esModule: true,
  default: () => <div data-testid='response-panel' />,
}));
jest.mock('@/components/mobile/HistoryPanel', () => ({
  __esModule: true,
  default: () => <div data-testid='history-panel' />,
}));
jest.mock('@/components/EmergencyButton', () => ({
  __esModule: true,
  default: () => <div data-testid='emergency-button' />,
}));
jest.mock('@/components/QuickPhrases', () => ({
  __esModule: true,
  default: () => <div data-testid='quick-phrases' />,
}));
jest.mock('@/hooks/useViewportHeight', () => ({
  useViewportHeight: () => ({ vh: 800, visualVh: 800 }),
}));

const baseProps = {
  textInput: '',
  onTextInputChange: jest.fn(),
  onSendMessage: jest.fn(),
  frozenResponses: null,
  onFreezeToggle: jest.fn(),
  pendingResponses: [],
  onResponseSelect: jest.fn(),
  onConnectButtonPress: jest.fn(),
  onSettingsPress: jest.fn(),
  chatHistory: [],
  conversations: [],
  selectedConversationIndex: null,
  onConversationSelect: jest.fn(),
  onNewConversation: jest.fn(),
  onDeleteConversation: jest.fn(),
};

const renderLayout = (
  props: Partial<React.ComponentProps<typeof MobileConversationLayout>>,
) =>
  render(
    <I18nProvider>
      <MobileConversationLayout
        {...baseProps}
        {...props}
      />
    </I18nProvider>,
  );

describe('MobileConversationLayout', () => {
  describe('active session (split view)', () => {
    it('shows chat and responses together without a tab bar', () => {
      renderLayout({ isConnected: true, isHistoryMode: false });

      expect(screen.getByTestId('chat-panel')).toBeInTheDocument();
      expect(screen.getByTestId('response-panel')).toBeInTheDocument();
      expect(screen.queryByTestId('history-panel')).not.toBeInTheDocument();
      // No Chat/History tab buttons in split view
      expect(
        screen.queryByRole('button', { name: 'Chat' }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'History' }),
      ).not.toBeInTheDocument();
    });

    it('requests medium responses from the backend', () => {
      const onResponseSizeChange = jest.fn();
      renderLayout({
        isConnected: true,
        isHistoryMode: false,
        onResponseSizeChange,
      });

      expect(onResponseSizeChange).toHaveBeenCalledWith(RESPONSES_SIZES.M);
    });

    it('keeps the message input footer visible', () => {
      renderLayout({ isConnected: true, isHistoryMode: false });

      expect(screen.getByRole('textbox')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument();
    });
  });

  describe('history mode', () => {
    it('shows the Chat/History tab bar with the history panel active', () => {
      renderLayout({
        isConnected: false,
        isHistoryMode: true,
        initialActivePanel: 'history',
      });

      expect(screen.getByRole('button', { name: 'Chat' })).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'History' }),
      ).toBeInTheDocument();
      expect(screen.getByTestId('history-panel')).toBeInTheDocument();
      expect(screen.queryByTestId('response-panel')).not.toBeInTheDocument();
    });
  });
});
