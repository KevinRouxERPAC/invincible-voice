// Centralizes how the frontend reaches the backend.
//
// - In Docker / local-with-proxy (no NEXT_PUBLIC_BACKEND_URL): same-origin
//   "/api/..." paths, proxied by Traefik (or Next rewrites) to the backend.
// - In a split deployment (e.g. static PWA on Firebase Hosting + backend on
//   Cloud Run): NEXT_PUBLIC_BACKEND_URL is set to the backend's absolute URL,
//   and we call it directly. The backend serves routes at its root, so we do
//   NOT add the "/api" prefix in that case.
//
// NEXT_PUBLIC_BACKEND_URL is inlined at build time, so this works in the
// statically exported bundle too.

export const BACKEND_BASE = (process.env.NEXT_PUBLIC_BACKEND_URL ?? '').replace(
  /\/$/,
  '',
);

/**
 * Build a URL for a backend route.
 * @param path A backend path starting with a slash, e.g. "/v1/health".
 */
export const apiUrl = (path: string): string =>
  BACKEND_BASE ? `${BACKEND_BASE}${path}` : `/api${path}`;

/**
 * fetch() with a hard timeout. A plain fetch can hang indefinitely on a flaky
 * mobile network — e.g. a Wi-Fi→5G handover mid-request, or a Cloud Run backend
 * still cold-starting — which would leave the app stuck forever on a blocking
 * gate (the "Loading…" screen). The AbortController guarantees the promise
 * always settles: on timeout it rejects with an AbortError, so callers fall
 * into their existing network-error branch instead of never resolving.
 */
export const fetchWithTimeout = async (
  input: string,
  init: RequestInit = {},
  timeoutMs = 10000,
): Promise<Response> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
};
