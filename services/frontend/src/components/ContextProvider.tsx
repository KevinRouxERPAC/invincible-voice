'use client';

import { FC, PropsWithChildren } from 'react';
import ScanProvider from '@/accessibility/ScanProvider';
import AuthProvider from '@/auth/authContext';
import { I18nProvider } from '@/i18n';

const ContextProvider: FC<PropsWithChildren> = ({ children = null }) => {
  return (
    <I18nProvider>
      <AuthProvider>
        <ScanProvider>{children}</ScanProvider>
      </AuthProvider>
    </I18nProvider>
  );
};

export default ContextProvider;
