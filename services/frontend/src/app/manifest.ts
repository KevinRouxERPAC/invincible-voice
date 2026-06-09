import type { MetadataRoute } from 'next';

// Required for the static export (NEXT_OUTPUT=export, Firebase Hosting):
// route handlers like manifest.ts must opt in to static rendering.
export const dynamic = 'force-static';

// Web App Manifest — makes InvincibleVoice installable as a PWA on Android
// (and add-to-home-screen on iOS). See layout.tsx for the related <meta> tags.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'InvincibleVoice',
    short_name: 'Invincible',
    description:
      'Real-time voice communication assistant for people who are losing the ability to speak.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#101010',
    theme_color: '#101010',
    lang: 'fr',
    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
