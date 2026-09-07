import { Capacitor } from '@capacitor/core';

/** True when running inside a Capacitor native shell (Android / iOS). */
export const isNativeApp = (): boolean => Capacitor.isNativePlatform();

export const getNativePlatform = (): string => Capacitor.getPlatform();

/**
 * Link to the terms / privacy page.
 *
 * Firebase Hosting rewrites `/privacy` to `/privacy.html` (see firebase.json),
 * but the Capacitor WebView serves the exported files as they are: a request
 * for the extensionless path falls back to the app shell, which reloads the
 * app on the home screen and never shows the terms. Native builds therefore
 * link to the real file; the web keeps its clean URL.
 */
export const privacyHref = (): string =>
  isNativeApp() ? '/privacy.html' : '/privacy';
