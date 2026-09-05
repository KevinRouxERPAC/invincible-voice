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
      preferLocal: false,
      pitch: 0.8,
      rate: 1.1,
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

  test('falls back to the local engine when the cached/backend path fails', async () => {
    (playQuickPhrase as jest.Mock)
      .mockImplementationOnce(() => Promise.reject(new Error('offline')))
      .mockImplementationOnce(() => Promise.resolve('native'));
    saveSettingsSnapshot(SETTINGS);
    const user = userEvent.setup();
    render(<EmergencyButton />);

    await user.click(screen.getByRole('button', { name: 'Help' }));

    expect(playQuickPhrase).toHaveBeenCalledTimes(2);
    expect(playQuickPhrase).toHaveBeenLastCalledWith(
      expect.objectContaining({ preferLocal: true }),
    );
  });

  test('uses the latest snapshot after voice and language change', async () => {
    saveSettingsSnapshot({
      ...SETTINGS,
      voice: 'old-voice',
      expected_transcription_language: 'en',
    });
    const user = userEvent.setup();
    const { unmount } = render(<EmergencyButton />);

    await user.click(screen.getByRole('button', { name: 'Help' }));
    expect(playQuickPhrase).toHaveBeenLastCalledWith({
      text: 'I need help, please come!',
      voiceName: 'old-voice',
      lang: 'en',
      preferLocal: false,
      pitch: 0.8,
      rate: 1.1,
    });

    unmount();
    jest.clearAllMocks();

    saveSettingsSnapshot({
      ...SETTINGS,
      voice: 'new-voice',
      expected_transcription_language: 'fr',
    });
    render(<EmergencyButton />);
    await user.click(screen.getByRole('button', { name: 'Help' }));

    expect(playQuickPhrase).toHaveBeenLastCalledWith({
      text: 'I need help, please come!',
      voiceName: 'new-voice',
      lang: 'fr',
      preferLocal: false,
      pitch: 0.8,
      rate: 1.1,
    });
  });
});
