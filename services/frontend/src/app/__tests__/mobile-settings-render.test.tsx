import { render, screen } from '@testing-library/react';
import ConversationLayout, {
  type ConversationLayoutProps,
} from '../../components/ConversationLayout';
import type { UserData } from '../../utils/userData';

// Stub the heavy child panels: this test only exercises the settings-modal
// branch, and mounting the full mobile layout would pull in unrelated hooks and
// data. The two settings popups are deliberately left REAL so the test proves
// ConversationLayout imports them correctly (the mobile one was once imported
// as a named export of a default-only module → `undefined` → a render crash the
// moment the settings modal opened on a phone).
jest.mock('@/components/AccessoriesDrawer', () => () => null);
jest.mock('@/components/EmergencyButton', () => () => null);
jest.mock('@/components/QuickPhrases', () => () => null);
jest.mock('@/components/conversations/ConversationHistory', () => () => null);
jest.mock('@/components/mobile/ChatPanel', () => () => null);
jest.mock('@/components/mobile/HistoryPanel', () => () => null);
jest.mock('@/components/mobile/ResponsePanel', () => () => null);
jest.mock('@/components/ui/ErrorMessages', () => () => null);

const USER_DATA: UserData = {
  email: 'kevin@example.com',
  user_id: 'test',
  user_settings: {
    name: 'Kevin',
    prompt: '',
    additional_keywords: [],
    friends: [],
    documents: [],
    quick_phrases: [],
    appointments: [],
    voice: null,
    expected_transcription_language: null,
    accepted_terms_of_services: true,
    learn_style: false,
  },
  conversations: [],
};

function makeProps(
  overrides: Partial<ConversationLayoutProps> = {},
): ConversationLayoutProps {
  const noop = () => {};
  return {
    shouldConnect: false,
    onConnectButtonPress: noop,
    isMobile: true,
    chatHistory: [],
    currentSpeakerMessage: '',
    pendingResponses: [],
    frozenResponses: null,
    onResponseSelect: noop,
    onResponseEdit: noop,
    onResponseSizeChange: noop,
    pendingKeywords: [],
    textInput: '',
    onTextInputChange: noop,
    onSendMessage: noop,
    directiveInput: '',
    onDirectiveInputChange: noop,
    onDirectiveSubmit: noop,
    isInitiating: false,
    onToggleInitiating: noop,
    userData: USER_DATA,
    userDataError: null,
    selectedConversationIndex: null,
    isViewingPastConversation: false,
    isShowingHistoryFromIdle: false,
    onConversationSelect: noop,
    onNewConversation: noop,
    onDeleteConversation: noop,
    onShowHistoryFromIdle: noop,
    onBack: noop,
    isSettingsOpen: true,
    settingsBlockedMessage: null,
    onSettingsOpen: noop,
    onSettingsSave: noop,
    onSettingsCancel: noop,
    errors: [],
    setErrors: noop,
    onWordBubbleClick: noop,
    onKeywordSelect: noop,
    onIntentClick: noop,
    onQuickPhraseSelect: noop,
    debugDict: null,
    ...overrides,
  };
}

describe('ConversationLayout settings modal', () => {
  it('renders the mobile settings popup without crashing when isMobile', () => {
    render(<ConversationLayout {...makeProps({ isMobile: true })} />);

    // Text unique to MobileSettingsPopup: if the component regresses to
    // `undefined` (default export imported as a named one), React throws before
    // this assertion is reached.
    expect(
      screen.getByText(/More settings are available/i),
    ).toBeInTheDocument();
  });
});
