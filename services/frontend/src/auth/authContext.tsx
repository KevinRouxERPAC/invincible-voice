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
import { useLocale } from '../i18n/I18nContext';
import type { UserData } from '../types/user';
import { apiUrl, fetchWithTimeout } from '../utils/backend';
import {
  addAuthHeaders,
  clearBearerToken,
  getBearerToken,
  setBearerToken,
} from './authUtils';

export const AUTH_STATUSES = {
  LOGGED: 'LOGGED',
  NOT_CHECKED: 'NOT_CHECKED',
  NOT_LOGGED: 'NOT_LOGGED',
} as const;

type AuthStatusKeys = keyof typeof AUTH_STATUSES;
export type AuthStatus = (typeof AUTH_STATUSES)[AuthStatusKeys];

interface AuthContextInterface {
  authStatus: AuthStatus;
  authError: 'invalid' | 'not_provisioned' | 'password_conflict' | false;
  allowPassword: boolean;
  googleClientId: string;
  userData: UserData | null;
  signIn: (email: string, password: string) => void;
  googleSignIn: (googleToken: string) => void;
  setAuthError: (
    error: 'invalid' | 'not_provisioned' | 'password_conflict' | false,
  ) => void;
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
  signIn: () => {},
  googleSignIn: () => {},
  setAuthError: () => {},
  signOut: () => {},
  acceptTermsOfServices: async () => {},
  fetchUserData: async () => {},
});

export const useAuthContext = () => useContext(AuthContext);

// The Google button is hidden while the client id is unknown. The backend can
// take tens of seconds to answer on a Cloud Run cold start, so cache the last
// known value per device: returning users see the button immediately and the
// fetch below only corrects the cache if the server config changed.
const GOOGLE_CLIENT_ID_CACHE_KEY = 'invincible-voice-google-client-id';

const getCachedGoogleClientId = (): string => {
  if (typeof window === 'undefined') {
    return '';
  }
  return localStorage.getItem(GOOGLE_CLIENT_ID_CACHE_KEY) ?? '';
};

const AuthProvider: FC<PropsWithChildren> = ({ children = null }) => {
  const [authError, setAuthError] = useState<
    'invalid' | 'not_provisioned' | 'password_conflict' | false
  >(false);
  const [authStatus, setAuthStatus] = useState<AuthStatus>(
    AUTH_STATUSES.NOT_CHECKED,
  );
  const [allowPassword, setAllowPassword] = useState<boolean>(true);
  const [googleClientId, setGoogleClientId] = useState<string>(
    getCachedGoogleClientId,
  );
  const [userData, setUserData] = useState<UserData | null>(null);
  const router = useRouter();
  const locale = useLocale();

  const fetchUserData = useCallback(async () => {
    try {
      const bearerToken = getBearerToken();
      if (!bearerToken) {
        return;
      }
      const response = await fetchWithTimeout(apiUrl(`/v1/user/`), {
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
      const bearerToken = getBearerToken();
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
    clearBearerToken();
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
          setBearerToken(data.access_token);
          setAuthStatus(AUTH_STATUSES.LOGGED);
          await fetchUserData();
        } else {
          setAuthError('invalid');
        }
      } catch {
        setAuthError('invalid');
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
          setBearerToken(data.access_token);
          setAuthStatus(AUTH_STATUSES.LOGGED);
          await fetchUserData();
        } else if (response.status === 403) {
          setAuthError('not_provisioned');
        } else if (response.status === 409) {
          setAuthError('password_conflict');
        } else {
          setAuthError('invalid');
        }
      } catch {
        setAuthError('invalid');
      } finally {
        // Web OAuth returns with #id_token=… in the hash; clear it so a refresh
        // does not replay the token. Native Capacitor sign-in has no hash.
        if (
          typeof window !== 'undefined' &&
          window.location.hash.includes('id_token=')
        ) {
          router.replace('/');
        }
      }
    },
    [router, locale, fetchUserData],
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
      setAuthError,
      signOut,
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
      setAuthError,
      signOut,
      acceptTermsOfServices,
      fetchUserData,
    ],
  );

  useEffect(() => {
    // Bounded so a hung request can never leave the app stuck on "Loading…":
    // AuthWrapper blocks all rendering while authStatus is NOT_CHECKED, so this
    // check MUST always resolve. On a flaky mobile network (5G handover) or a
    // Cloud Run cold start, a plain fetch can hang forever — the timeout turns
    // that into a normal error we can recover from.
    const AUTH_CHECK_TIMEOUT_MS = 10000;
    // A cold start can take tens of seconds. If the first check times out we
    // render in degraded mode immediately (below) but keep re-checking in the
    // background so the app upgrades itself to full mode once the backend wakes
    // up, without the user having to relaunch.
    const AUTH_CHECK_RETRY_MS = 5000;
    const AUTH_CHECK_MAX_RETRIES = 3;

    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;

    async function checkAuthStatus() {
      const bearerToken = getBearerToken();

      if (!bearerToken) {
        setAuthStatus(AUTH_STATUSES.NOT_LOGGED);
        return;
      }

      try {
        const response = await fetchWithTimeout(
          apiUrl(`/v1/user/`),
          {
            method: 'GET',
            headers: addAuthHeaders({
              Authorization: `Bearer ${bearerToken}`,
              'Content-Type': 'application/json',
            }),
          },
          AUTH_CHECK_TIMEOUT_MS,
        );
        if (cancelled) {
          return;
        }
        if (!response.ok) {
          // The backend rejected the token: sign out for real
          clearBearerToken();
          setAuthStatus(AUTH_STATUSES.NOT_LOGGED);
          setUserData(null);
          return;
        }
        // Reuse this response instead of firing a second /v1/user/ request.
        const data: UserData = await response.json();
        if (cancelled) {
          return;
        }
        setUserData(data);
        setAuthStatus(AUTH_STATUSES.LOGGED);
      } catch {
        if (cancelled) {
          return;
        }
        // Timeout or network error (offline, backend down/cold): keep the token
        // and let the app render its degraded mode instead of locking the user
        // out on a login screen that cannot work without the backend. Then keep
        // retrying in the background so a slow cold start self-heals into full
        // mode.
        setAuthStatus(AUTH_STATUSES.LOGGED);
        if (attempts < AUTH_CHECK_MAX_RETRIES) {
          attempts += 1;
          retryTimer = setTimeout(checkAuthStatus, AUTH_CHECK_RETRY_MS);
        }
      }
    }

    checkAuthStatus();

    return () => {
      cancelled = true;
      if (retryTimer) {
        clearTimeout(retryTimer);
      }
    };
  }, []);

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
          localStorage.setItem(
            GOOGLE_CLIENT_ID_CACHE_KEY,
            data.google_client_id,
          );
        }
      } catch {
        // Network error (offline, cold start timeout): keep the cached value
        // instead of hiding the button on a device that has seen it before.
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
