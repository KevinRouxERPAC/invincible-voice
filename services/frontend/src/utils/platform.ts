import { Capacitor } from '@capacitor/core';

/** True when running inside a Capacitor native shell (Android / iOS). */
export const isNativeApp = (): boolean => Capacitor.isNativePlatform();

export const getNativePlatform = (): string => Capacitor.getPlatform();
