import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AppointmentRunner from '../../components/appointments/AppointmentRunner';

jest.mock('@/utils/phraseAudio', () => ({
  ...jest.requireActual('@/utils/phraseAudio'),
  playQuickPhrase: jest.fn(() => Promise.resolve('cached')),
}));

// eslint-disable-next-line import/first
import { playQuickPhrase } from '../../utils/phraseAudio';

const APPOINTMENT = {
  title: 'Doctor',
  phrases: ['Hello doctor', 'I have a headache', 'Thank you'],
};

describe('AppointmentRunner', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('speaks a phrase when it is tapped', async () => {
    const user = userEvent.setup();
    render(
      <AppointmentRunner
        appointment={APPOINTMENT}
        voiceName='my-voice'
        lang='en'
        onClose={() => {}}
      />,
    );

    await user.click(screen.getByText('I have a headache'));

    expect(playQuickPhrase).toHaveBeenCalledWith({
      text: 'I have a headache',
      voiceName: 'my-voice',
      lang: 'en',
    });
  });

  test('Next advances and speaks the following phrase', async () => {
    const user = userEvent.setup();
    render(
      <AppointmentRunner
        appointment={APPOINTMENT}
        voiceName='my-voice'
        lang='en'
        onClose={() => {}}
      />,
    );

    // Starts on phrase 0; Next should speak phrase 1.
    await user.click(screen.getByRole('button', { name: 'Next' }));

    expect(playQuickPhrase).toHaveBeenLastCalledWith(
      expect.objectContaining({ text: 'I have a headache' }),
    );
  });

  test('ignores empty phrases', () => {
    render(
      <AppointmentRunner
        appointment={{ title: 'Empty', phrases: ['', '   '] }}
        onClose={() => {}}
      />,
    );

    expect(
      screen.getByText('This appointment has no phrases yet.'),
    ).toBeInTheDocument();
  });
});
