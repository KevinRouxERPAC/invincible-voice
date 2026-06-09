'use client';

import { useEffect } from 'react';

// Registers the PWA service worker (public/sw.js) on the client.
// Renders nothing; mounted once from the root layout.
const ServiceWorkerRegister = () => {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV !== 'production') return;

    const register = () => {
      navigator.serviceWorker.register('/sw.js').catch((error) => {
        // Non-fatal: the app still works without offline support.
        console.warn('Service worker registration failed:', error);
      });
    };

    window.addEventListener('load', register);
    return () => window.removeEventListener('load', register);
  }, []);

  return null;
};

export default ServiceWorkerRegister;
