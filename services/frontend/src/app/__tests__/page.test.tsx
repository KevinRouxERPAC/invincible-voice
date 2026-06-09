import { render, screen } from '@testing-library/react';
import Home from '../page';

// Mock the auth wrapper so the page renders without a real auth flow
jest.mock('@/auth/AuthWrapper', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid='auth-wrapper'>{children}</div>
  ),
}));

// Mock the main component to keep this a pure page-structure test
jest.mock('@/components/InvincibleVoice', () => ({
  __esModule: true,
  default: () => (
    <div data-testid='invincible-voice'>InvincibleVoice Component</div>
  ),
}));

describe('Home Page Component Tests', () => {
  test('renders InvincibleVoice wrapped in the auth wrapper', () => {
    render(<Home />);

    const authWrapper = screen.getByTestId('auth-wrapper');
    const invincibleVoice = screen.getByTestId('invincible-voice');

    expect(authWrapper).toBeInTheDocument();
    expect(invincibleVoice).toBeInTheDocument();
    // InvincibleVoice must be rendered inside the auth wrapper so it is
    // only shown to authenticated users
    expect(authWrapper).toContainElement(invincibleVoice);
  });
});
