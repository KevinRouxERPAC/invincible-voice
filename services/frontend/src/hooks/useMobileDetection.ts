'use client';

import { useState, useEffect } from 'react';
import { isNativeApp } from '@/utils/platform';

export const useMobileDetection = () => {
  const [isMobile, setIsMobile] = useState(isNativeApp());

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
