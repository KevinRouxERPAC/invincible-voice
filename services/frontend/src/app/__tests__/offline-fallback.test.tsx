import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import OfflineFallback from '../../components/OfflineFallback';
import {
  loadSettingsSnapshot,
  saveSettingsSnapshot,
} from '../../utils/localSettingsCache';
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
  quick_phrases: [
    { text: 'I need help, please.', category: 'Needs' },
    { text: 'Thank you so much!', category: 'Social' },
  ],
  voice: 'my-voice',
  expected_transcription_language: 'fr',
  accepted_terms_of_services: true,
};

const HEALTH_DOWN = { connected: 'no' as const, ok: false };

describe('localSettingsCache', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('returns null when nothing was saved', () => {
    expect(loadSettingsSnapshot()).toBeNull();
  });

  test('round-trips the offline-relevant subset of the settings', () => {
    saveSettingsSnapshot(SETTINGS);

    const snapshot = loadSettingsSnapshot();

    expect(snapshot).toEqual({
      quick_phrases: SETTINGS.quick_phrases,
      voice: 'my-voice',
      expected_transcription_language: 'fr',
    });
  });

  test('survives corrupted storage content', () => {
    localStorage.setItem('invincible-voice-settings-snapshot', '{not json');
    expect(loadSettingsSnapshot()).toBeNull();
  });
});

describe('OfflineFallback', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
  });

  test('shows the cached quick phrases and speaks them on tap', async () => {
    saveSettingsSnapshot(SETTINGS);
    const user = userEvent.setup();
    render(
      <OfflineFallback
        healthStatus={HEALTH_DOWN}
        onRetry={jest.fn()}
      />,
    );

    await user.click(screen.getByText('I need help, please.'));

    expect(playQuickPhrase).toHaveBeenCalledWith({
      text: 'I need help, please.',
      voiceName: 'my-voice',
      lang: 'fr',
    });
  });

  test('speaks free text typed by the user', async () => {
    const user = userEvent.setup();
    render(
      <OfflineFallback
        healthStatus={HEALTH_DOWN}
        onRetry={jest.fn()}
      />,
    );

    await user.type(
      screen.getByPlaceholderText('Type a phrase to say out loud…'),
      'Hello there',
    );
    await user.click(screen.getByText('Speak'));

    expect(playQuickPhrase).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'Hello there' }),
    );
  });

  test('retry button triggers a new health check', async () => {
    const onRetry = jest.fn();
    const user = userEvent.setup();
    render(
      <OfflineFallback
        healthStatus={HEALTH_DOWN}
        onRetry={onRetry}
      />,
    );

    await user.click(screen.getByText('Retry connection'));

    expect(onRetry).toHaveBeenCalled();
  });
});
