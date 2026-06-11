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
    allowMixedContent: true,
  },
};

export default config;
