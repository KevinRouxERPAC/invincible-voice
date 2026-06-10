import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EmergencyButton from '../../components/EmergencyButton';
import { saveSettingsSnapshot } from '../../utils/localSettingsCache';
import { UserSettings } from '../../utils/userData';

jest.mock('@/utils/phraseAudio', () => ({
  ...jest.requireActual('@/utils/phraseAudio'),
  playQuickPhrase: jest.fn(() => Promise.resolve('cached')),
}));

// eslint-disable-next-line import/first
import { playQuickPhrase } from '../../utils/phraseAudio';

const SETTINGS: UserSettings = {
  name: 'Test',
  prompt: '',
  additional_keywords: [],
  friends: [],
  documents: [],
  quick_phrases: [],
  voice: 'my-voice',
  expected_transcription_language: 'fr',
  accepted_terms_of_services: true,
};

describe('EmergencyButton', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
  });

  test('speaks the emergency phrase with the cached voice settings', async () => {
    saveSettingsSnapshot(SETTINGS);
    const user = userEvent.setup();
    render(<EmergencyButton />);

    await user.click(screen.getByRole('button', { name: 'Help' }));

    expect(playQuickPhrase).toHaveBeenCalledWith({
      text: 'I need help, please come!',
      voiceName: 'my-voice',
      lang: 'fr',
    });
  });

  test('still works without any cached settings', async () => {
    const user = userEvent.setup();
    render(<EmergencyButton compact />);

    await user.click(screen.getByRole('button', { name: 'Help' }));

    expect(playQuickPhrase).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'I need help, please come!' }),
    );
  });
});
