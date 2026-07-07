/* eslint-disable react/function-component-definition */
import type { Metadata, Viewport } from 'next';
import './globals.css';
import localFont from 'next/font/local';
import ContextProvider from '@/components/ContextProvider';
import ServiceWorkerRegister from '@/components/ServiceWorkerRegister';

export const metadata: Metadata = {
  title: 'InvincibleVoice by Kyutai',
  description: 'Help people with SLA.',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Invincible',
  },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#f4f2ec',
};

const satoshi = localFont({
  src: [
    {
      path: '../assets/fonts/Satoshi-Variable.woff2',
      weight: '300 900',
      style: 'normal',
    },
    {
      path: '../assets/fonts/Satoshi-VariableItalic.woff2',
      weight: '300 900',
      style: 'italic',
    },
  ],
  variable: '--font-satoshi',
  display: 'swap',
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang='en'
      className={satoshi.className}
    >
      <head>
        {/* eslint-disable react/no-danger */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                var settings = JSON.parse(localStorage.getItem('invincible-voice-ui-settings') || '{}');
                if (settings.theme === 'dark') {
                  document.documentElement.classList.add('dark');
                }
                if (settings.contrast === 'high') {
                  document.documentElement.classList.add('contrast');
                }
                if (typeof settings.fontScale === 'number' && settings.fontScale >= 1 && settings.fontScale <= 1.5) {
                  document.documentElement.style.setProperty('--fz', String(settings.fontScale));
                }
              } catch (e) {}
            `,
          }}
        />
        {/* eslint-enable react/no-danger */}
      </head>
      <body className='font-satoshi'>
        <ServiceWorkerRegister />
        <ContextProvider>{children}</ContextProvider>
      </body>
    </html>
  );
}
