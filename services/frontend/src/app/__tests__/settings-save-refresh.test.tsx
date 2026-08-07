import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import QuickPhrases from '../../components/QuickPhrases';
import type { QuickPhrase } from '../../utils/userData';

describe('QuickPhrases settings save → refresh', () => {
  test('re-renders with new phrases after settings update without full remount', async () => {
    const user = userEvent.setup();
    const initial: QuickPhrase[] = [{ text: 'Hello', category: 'Social' }];
    const updated: QuickPhrase[] = [
      { text: 'Hello', category: 'Social' },
      { text: 'I need water', category: 'Needs' },
    ];

    function Harness() {
      const [phrases, setPhrases] = useState(initial);
      return (
        <div>
          <button type='button' onClick={() => setPhrases(updated)}>
            save-settings
          </button>
          <QuickPhrases phrases={phrases} onSelect={jest.fn()} />
        </div>
      );
    }

    render(<Harness />);
    expect(screen.getByText('Hello')).toBeInTheDocument();
    expect(screen.queryByText('I need water')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'save-settings' }));

    expect(screen.getByText('I need water')).toBeInTheDocument();
    expect(screen.getByText('Needs')).toBeInTheDocument();
  });
});
