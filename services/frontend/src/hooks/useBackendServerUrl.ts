import { useMemo } from 'react';
import { BACKEND_BASE } from '@/utils/backend';

// Returns the base URL used to open the conversation WebSocket.
// Modern browsers accept http(s) URLs in `new WebSocket()` and treat them as
// ws(s), so we return an http(s) base here and let the WebSocket layer upgrade.
export const useBackendServerUrl = () => {
  const backendServerUrl = useMemo(() => {
    // Split deployment (e.g. Firebase Hosting PWA + Cloud Run backend):
    // talk to the backend directly at its absolute URL.
    if (BACKEND_BASE) {
      return BACKEND_BASE;
    }

    // Same-origin deployment (Docker behind Traefik): the backend is reachable
    // under the "/api" prefix on the current origin.
    const url = new URL('/api', window.location.href);
    url.search = '';
    return url.toString().replace(/\/$/, '');
  }, []);

  return backendServerUrl;
};
