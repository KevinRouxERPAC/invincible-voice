'use client';

import { FC, PropsWithChildren, useEffect } from 'react';
import ScanProvider from '@/accessibility/ScanProvider';
import AuthProvider from '@/auth/authContext';
import { I18nProvider } from '@/i18n';
import { getUiSettings, UI_SETTINGS_CHANGED_EVENT } from '@/utils/uiSettings';

const ContextProvider: FC<PropsWithChildren> = ({ children = null }) => {
  useEffect(() => {
    const applyUiSettings = () => {
      const settings = getUiSettings();
      const root = document.documentElement;

      if (settings.theme === 'dark') {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }

      if (settings.contrast === 'high') {
        root.classList.add('contrast');
      } else {
        root.classList.remove('contrast');
      }
    };

    // Apply settings immediately on client-side mount
    applyUiSettings();

    // Listen for future runtime changes
    window.addEventListener(UI_SETTINGS_CHANGED_EVENT, applyUiSettings);
    return () => {
      window.removeEventListener(UI_SETTINGS_CHANGED_EVENT, applyUiSettings);
    };
  }, []);

  return (
    <I18nProvider>
      <AuthProvider>
        <ScanProvider>{children}</ScanProvider>
      </AuthProvider>
    </I18nProvider>
  );
};

export default ContextProvider;
