'use client';

import { useState, useEffect } from 'react';
import { isNativeApp } from '@/utils/platform';

// Resolve the best guess synchronously so the very first client render already
// picks the right layout (avoids a flash of the desktop UI on phone browsers).
const getInitialIsMobile = (): boolean => {
  if (isNativeApp()) {
    return true;
  }
  if (typeof window !== 'undefined') {
    return window.innerWidth < 1025;
  }
  return false;
};

export const useMobileDetection = () => {
  const [isMobile, setIsMobile] = useState(getInitialIsMobile);

  useEffect(() => {
    if (isNativeApp()) {
      setIsMobile(true);
      return undefined;
    }

    const checkMobile = () => {
      const isMobileWidth = window.innerWidth < 1025;
      setIsMobile(isMobileWidth);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  return isMobile;
};
