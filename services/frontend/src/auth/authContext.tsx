import { useRouter } from 'next/navigation';
import {
  FC,
  PropsWithChildren,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import Cookies from 'universal-cookie';
import { useLocale } from '../i18n/I18nContext';
import type { UserData } from '../types/user';
import { apiUrl } from '../utils/backend';
import { addAuthHeaders } from './authUtils';

export const AUTH_STATUSES = {
  LOGGED: 'LOGGED',
  NOT_CHECKED: 'NOT_CHECKED',
  NOT_LOGGED: 'NOT_LOGGED',
} as const;

type AuthStatusKeys = keyof typeof AUTH_STATUSES;
export type AuthStatus = (typeof AUTH_STATUSES)[AuthStatusKeys];

interface AuthContextInterface {
  authStatus: AuthStatus;
  authError: boolean;
  allowPassword: boolean;
  googleClientId: string;
  userData: UserData | null;
  register: (email: string, password: string) => void;
  signIn: (email: string, password: string) => void;
  googleSignIn: (googleToken: string) => void;
  signOut: () => void;
  acceptTermsOfServices: () => Promise<void>;
  fetchUserData: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextInterface>({
  authStatus: AUTH_STATUSES.NOT_CHECKED,
  authError: false,
  allowPassword: true,
  googleClientId: '',
  userData: null,
  register: () => {},
  signIn: () => {},
  googleSignIn: () => {},
  signOut: () => {},
  acceptTermsOfServices: async () => {},
  fetchUserData: async () => {},
});

export const useAuthContext = () => useContext(AuthContext);

// The token is only ever read from JS to fill the Authorization header, never
// sent automatically, so SameSite=Strict costs nothing. `secure` must stay
// conditional: the Capacitor Android app serves from http://localhost where a
// Secure cookie would be silently dropped.
const bearerCookieOptions = () => ({
  path: '/',
  sameSite: 'strict' as const,
  secure:
    typeof window !== 'undefined' && window.location.protocol === 'https:',
});

const AuthProvider: FC<PropsWithChildren> = ({ children = null }) => {
  const [authError, setAuthError] = useState<boolean>(false);
  const [authStatus, setAuthStatus] = useState<AuthStatus>(
    AUTH_STATUSES.NOT_CHECKED,
  );
  const [allowPassword, setAllowPassword] = useState<boolean>(true);
  const [googleClientId, setGoogleClientId] = useState<string>('');
  const [userData, setUserData] = useState<UserData | null>(null);
  const router = useRouter();
  const locale = useLocale();

  const fetchUserData = useCallback(async () => {
    try {
      const bearerToken = new Cookies().get('bearerToken');
      if (!bearerToken) {
        return;
      }
      const response = await fetch(apiUrl(`/v1/user/`), {
        method: 'GET',
        headers: addAuthHeaders({
          Authorization: `Bearer ${bearerToken}`,
          'Content-Type': 'application/json',
        }),
      });
      if (response.ok) {
        const data: UserData = await response.json();
        setUserData(data);
      }
    } catch {
      setUserData(null);
    }
  }, []);

  const acceptTermsOfServices = useCallback(async () => {
    try {
      const bearerToken = new Cookies().get('bearerToken');
      if (!bearerToken) {
        return;
      }
      const response = await fetch(
        apiUrl(`/v1/user/accept_terms_of_services`),
        {
          method: 'POST',
          headers: addAuthHeaders({
            Authorization: `Bearer ${bearerToken}`,
            'Content-Type': 'application/json',
          }),
        },
      );
      if (response.ok) {
        await fetchUserData();
      }
    } catch {}
  }, [fetchUserData]);

  const signOut = useCallback(() => {
    new Cookies().remove('bearerToken');
    setAuthStatus(AUTH_STATUSES.NOT_LOGGED);
    setUserData(null);
  }, []);

  const signIn = useCallback(
    async (email: string, password: string) => {
      try {
        setAuthError(false);
        const body = new FormData();
        body.append('username', email);
        body.append('password', password);
        const response = await fetch(apiUrl('/auth/login'), {
          method: 'POST',
          body,
        });
        if (response.ok) {
          const data = await response.json();
          new Cookies().set(
            'bearerToken',
            data.access_token,
            bearerCookieOptions(),
          );
          setAuthStatus(AUTH_STATUSES.LOGGED);
          await fetchUserData();
        } else {
          setAuthError(true);
        }
      } catch {
        setAuthError(true);
      }
    },
    [fetchUserData],
  );
  const googleSignIn = useCallback(
    async (googleToken: string) => {
      try {
        setAuthError(false);
        const response = await fetch(apiUrl('/auth/google'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ token: googleToken, language: locale }),
        });
        if (response.ok) {
          const data = await response.json();
          new Cookies().set(
            'bearerToken',
            data.access_token,
            bearerCookieOptions(),
          );
          setAuthStatus(AUTH_STATUSES.LOGGED);
          await fetchUserData();
        } else {
          setAuthError(true);
        }
      } catch {
        setAuthError(true);
      } finally {
        router.replace('/');
      }
    },
    [router, locale, fetchUserData],
  );
  const register = useCallback(
    async (email: string, password: string) => {
      try {
        const body = new FormData();
        body.append('username', email);
        body.append('password', password);
        const response = await fetch(
          apiUrl(`/auth/register?language=${locale}`),
          {
            method: 'POST',
            body,
          },
        );
        if (response.ok) {
          const data = await response.json();
          new Cookies().set(
            'bearerToken',
            data.access_token,
            bearerCookieOptions(),
          );
          setAuthStatus(AUTH_STATUSES.LOGGED);
          await fetchUserData();
        }
      } catch {}
    },
    [locale, fetchUserData],
  );
  const memoizedValue = useMemo(
    () => ({
      authStatus,
      authError,
      allowPassword,
      googleClientId,
      userData,
      signIn,
      googleSignIn,
      signOut,
      register,
      acceptTermsOfServices,
      fetchUserData,
    }),
    [
      authStatus,
      authError,
      allowPassword,
      googleClientId,
      userData,
      signIn,
      googleSignIn,
      signOut,
      register,
      acceptTermsOfServices,
      fetchUserData,
    ],
  );

  useEffect(() => {
    async function checkAuthStatus() {
      const bearerToken = new Cookies().get('bearerToken');

      if (!bearerToken) {
        setAuthStatus(AUTH_STATUSES.NOT_LOGGED);
        return;
      }

      try {
        const response = await fetch(apiUrl(`/v1/user/`), {
          method: 'GET',
          headers: addAuthHeaders({
            Authorization: `Bearer ${bearerToken}`,
            'Content-Type': 'application/json',
          }),
        });
        if (!response.ok) {
          // The backend rejected the token: sign out for real
          new Cookies().remove('bearerToken');
          setAuthStatus(AUTH_STATUSES.NOT_LOGGED);
          setUserData(null);
          return;
        }
        setAuthStatus(AUTH_STATUSES.LOGGED);
        await fetchUserData();
      } catch {
        // Network error (offline, backend down): keep the token and let the
        // app render its degraded mode instead of locking the user out on
        // a login screen that cannot work without the backend.
        setAuthStatus(AUTH_STATUSES.LOGGED);
      }
    }

    checkAuthStatus();
  }, [fetchUserData]);

  useEffect(() => {
    async function checkAllowPassword() {
      try {
        const response = await fetch(apiUrl('/auth/allow-password'));
        if (response.ok) {
          const data = await response.json();
          setAllowPassword(data.allow_password);
        }
      } catch {
        setAllowPassword(true);
      }
    }

    checkAllowPassword();
  }, []);

  useEffect(() => {
    async function fetchGoogleClientId() {
      try {
        const response = await fetch(apiUrl('/auth/google-client-id'));
        if (response.ok) {
          const data = await response.json();
          setGoogleClientId(data.google_client_id);
        }
      } catch {
        setGoogleClientId('');
      }
    }

    fetchGoogleClientId();
  }, []);

  return (
    <AuthContext.Provider value={memoizedValue}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthProvider;
