import Cookies from 'universal-cookie';

export const BEARER_COOKIE = 'bearerToken';

// `secure` must follow the scheme: a Secure cookie is dropped by the browser on
// plain http (local `next dev`), so only enable it under https (production PWA
// and the Capacitor https://localhost WebView). `sameSite: 'strict'` blocks the
// token from being sent on cross-site requests (CSRF hardening).
function bearerCookieOptions() {
  const isHttps =
    typeof window !== 'undefined' && window.location.protocol === 'https:';
  return { path: '/', sameSite: 'strict', secure: isHttps } as const;
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
