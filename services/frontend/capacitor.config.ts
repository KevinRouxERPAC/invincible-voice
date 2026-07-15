import type { CapacitorConfig } from '@capacitor/cli';

const devServerUrl = process.env.CAPACITOR_SERVER_URL;
// When the backend is reached over plain http (USB `adb reverse` to a local
// dev backend), the WebView — served from https://localhost — must be allowed
// to load that mixed content. Production points at an https backend, so this
// stays off there.
const backendIsHttp = (process.env.NEXT_PUBLIC_BACKEND_URL ?? '').startsWith(
  'http://',
);

const config: CapacitorConfig = {
  appId: 'com.invinciblevoice.app',
  appName: 'InvincibleVoice',
  webDir: 'out',
  server: devServerUrl
    ? {
        url: devServerUrl,
        cleartext: devServerUrl.startsWith('http://'),
      }
    : undefined,
  android: {
    // Only permit cleartext/mixed content for the live-reload dev server
    // (CAPACITOR_SERVER_URL over http) or a local http backend. Production
    // builds talk to an https backend and must not load mixed content.
    allowMixedContent: Boolean(devServerUrl) || backendIsHttp,
  },
};

export default config;
