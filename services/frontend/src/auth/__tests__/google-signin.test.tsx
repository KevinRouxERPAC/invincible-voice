import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import Google from '@/auth/Google';
import { useAuthContext } from '@/auth/authContext';
import { isNativeApp } from '@/utils/platform';

jest.mock('@/auth/authContext', () => ({
  useAuthContext: jest.fn(),
}));

jest.mock('@/utils/platform', () => ({
  isNativeApp: jest.fn(() => true),
}));

const login = jest.fn();
const initialize = jest.fn();

jest.mock(
  '@capgo/capacitor-social-login',
  () => ({
    SocialLogin: {
      initialize: (...args: unknown[]) => initialize(...args),
      login: (...args: unknown[]) => login(...args),
    },
  }),
  { virtual: true },
);

const googleSignIn = jest.fn();
const setAuthError = jest.fn();

const mockedUseAuthContext = useAuthContext as jest.Mock;
const mockedIsNativeApp = isNativeApp as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockedIsNativeApp.mockReturnValue(true);
  mockedUseAuthContext.mockReturnValue({
    googleSignIn,
    googleClientId: 'test-client-id.apps.googleusercontent.com',
    setAuthError,
  });
});

const clickSignIn = () => {
  fireEvent.click(screen.getByRole('button', { name: /Sign in with Google/i }));
};

describe('native Google sign-in', () => {
  it('signs in with the id token returned by the plugin', async () => {
    login.mockResolvedValue({
      result: { responseType: 'online', idToken: 'id-token-123' },
    });

    render(<Google />);
    clickSignIn();

    await waitFor(() => expect(googleSignIn).toHaveBeenCalledWith('id-token-123'));
    expect(setAuthError).not.toHaveBeenCalledWith('google_failed');
  });

  // Android reports a server-side rejection (SHA-1 of the signing certificate
  // not registered on the Android OAuth client) as a cancellation, and the
  // plugin drops the underlying message. Swallowing that code left the button
  // doing visibly nothing, which is the one outcome a mute user cannot debug.
  it('reports a failure even when the plugin blames the user for cancelling', async () => {
    login.mockRejectedValue(
      Object.assign(new Error('Google Sign-In cancelled by user'), {
        code: 'USER_CANCELLED',
      }),
    );

    render(<Google />);
    clickSignIn();

    await waitFor(() =>
      expect(setAuthError).toHaveBeenCalledWith('google_failed'),
    );
    expect(googleSignIn).not.toHaveBeenCalled();
  });

  it('reports a failure when the plugin returns no id token', async () => {
    login.mockResolvedValue({ result: { responseType: 'online' } });

    render(<Google />);
    clickSignIn();

    await waitFor(() => expect(setAuthError).toHaveBeenCalledWith('invalid'));
    expect(googleSignIn).not.toHaveBeenCalled();
  });
});
