import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { isNativeApp } from './platform';

export const triggerHapticFeedback = async (
  style: ImpactStyle = ImpactStyle.Light,
) => {
  if (isNativeApp()) {
    try {
      await Haptics.impact({ style });
    } catch (e) {
      console.warn('Haptics not available:', e);
    }
  }
};

export const triggerHapticError = async () => {
  if (isNativeApp()) {
    try {
      // Use heavy impact to simulate error/warning buzz
      await Haptics.impact({ style: ImpactStyle.Heavy });
    } catch (e) {
      console.warn('Haptics not available:', e);
    }
  }
};
