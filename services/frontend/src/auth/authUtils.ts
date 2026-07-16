import Cookies from 'universal-cookie';

export const BEARER_COOKIE = 'bearerToken';

// Keep the session alive across app restarts. Without an explicit lifetime the
// cookie is a *session* cookie, which the Android WebView drops when the app
// process ends — forcing a fresh login on every launch. An AAC app used daily
// must not ask that. 90 days balances convenience and staleness; any auth call
// that 401s still clears the token and sends the user back to login.
const BEARER_MAX_AGE_SECONDS = 60 * 60 * 24 * 90;

// `secure` must follow the scheme: a Secure cookie is dropped by the browser on
// plain http (local `next dev`), so only enable it under https (production PWA
// and the Capacitor https://localhost WebView). `sameSite: 'strict'` blocks the
// token from being sent on cross-site requests (CSRF hardening).
function bearerCookieOptions() {
  const isHttps =
    typeof window !== 'undefined' && window.location.protocol === 'https:';
  return {
    path: '/',
    sameSite: 'strict',
    secure: isHttps,
    maxAge: BEARER_MAX_AGE_SECONDS,
  } as const;
}

export function getBearerToken(): string | undefined {
  return new Cookies().get(BEARER_COOKIE);
}

export function setBearerToken(token: string): void {
  new Cookies().set(BEARER_COOKIE, token, bearerCookieOptions());
}

export function clearBearerToken(): void {
  // The path must match the one used when setting the cookie, otherwise the
  // removal is a no-op and the user stays "logged in".
  new Cookies().remove(BEARER_COOKIE, { path: '/' });
}

export function getAuthHeaders(): HeadersInit {
  const bearerToken = getBearerToken();

  if (bearerToken) {
    return {
      Authorization: `Bearer ${bearerToken}`,
    };
  }

  return {};
}

export function addAuthHeaders(existingHeaders: HeadersInit = {}): HeadersInit {
  const authHeaders = getAuthHeaders();
  return {
    ...existingHeaders,
    ...authHeaders,
  };
}
