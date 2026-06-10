import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import QuickPhrases from '../../components/QuickPhrases';
import { QuickPhrase } from '../../utils/userData';

const PHRASES: QuickPhrase[] = [
  { text: 'I need help, please.', category: 'Needs' },
  { text: "I'm thirsty.", category: 'Needs' },
  { text: 'Thank you so much!', category: 'Social' },
];

describe('QuickPhrases', () => {
  test('renders nothing when there are no phrases', () => {
    const { container } = render(
      <QuickPhrases
        phrases={[]}
        onSelect={jest.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  test('renders phrases grouped under their category labels', () => {
    render(
      <QuickPhrases
        phrases={PHRASES}
        onSelect={jest.fn()}
      />,
    );

    expect(screen.getByText('Needs')).toBeInTheDocument();
    expect(screen.getByText('Social')).toBeInTheDocument();
    expect(screen.getByText('I need help, please.')).toBeInTheDocument();
    expect(screen.getByText("I'm thirsty.")).toBeInTheDocument();
    expect(screen.getByText('Thank you so much!')).toBeInTheDocument();
  });

  test('calls onSelect with the phrase text when clicked', async () => {
    const onSelect = jest.fn();
    const user = userEvent.setup();
    render(
      <QuickPhrases
        phrases={PHRASES}
        onSelect={onSelect}
      />,
    );

    await user.click(screen.getByText('I need help, please.'));

    expect(onSelect).toHaveBeenCalledWith('I need help, please.');
  });

  test('compact mode renders a flat strip without category labels', async () => {
    const onSelect = jest.fn();
    const user = userEvent.setup();
    render(
      <QuickPhrases
        phrases={PHRASES}
        onSelect={onSelect}
        compact
      />,
    );

    expect(screen.queryByText('Needs')).not.toBeInTheDocument();

    await user.click(screen.getByText("I'm thirsty."));
    expect(onSelect).toHaveBeenCalledWith("I'm thirsty.");
  });
});
