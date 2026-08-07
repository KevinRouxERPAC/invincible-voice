import { act, render, screen } from '@testing-library/react';
import ResponseOptions from '../../components/ResponseOptions';
import { setUiSettings } from '../../utils/uiSettings';

describe('ResponseOptions keyboard layout', () => {
  const responses = [
    { id: 'r1', text: 'Oui', isComplete: true },
    { id: 'r2', text: 'Non', isComplete: true },
    { id: 'r3', text: 'Peut-être', isComplete: true },
  ];

  beforeEach(() => {
    localStorage.clear();
  });

  test('shows AZERTY shortcuts by default and switches to QWERTY live', async () => {
    render(
      <ResponseOptions
        responses={responses}
        onSelect={jest.fn()}
        onEditModeChange={jest.fn()}
        alwaysShow
      />,
    );

    expect(screen.getByText('Z')).toBeInTheDocument();
    expect(screen.getByText('Q')).toBeInTheDocument();

    act(() => {
      setUiSettings({ keyboardLayout: 'qwerty' });
    });

    expect(screen.getByText('D')).toBeInTheDocument();
    expect(screen.getByText('F')).toBeInTheDocument();
    expect(screen.queryByText('Z')).not.toBeInTheDocument();
  });
});
