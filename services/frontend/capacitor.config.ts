import type { CapacitorConfig } from '@capacitor/cli';

const devServerUrl = process.env.CAPACITOR_SERVER_URL;

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
    // (CAPACITOR_SERVER_URL over http). Production builds talk to an https
    // backend and must not load mixed content.
    allowMixedContent: Boolean(devServerUrl),
  },
};

export default config;
