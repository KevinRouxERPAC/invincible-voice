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
