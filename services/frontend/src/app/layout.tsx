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
              // === DEMO MODE (Play Store screenshots) ===
              // Activate with ?demo=1 in the URL. Installs a mock backend BEFORE
              // any app code runs, so the full UI is navigable without credentials.
              // ?demo=login : mock health OK but no token → shows the login screen.
              (function() {
                var params = new URLSearchParams(window.location.search);
                var demoMode = params.get('demo');
                if (demoMode !== '1' && demoMode !== 'login') return;

                // demo=1 → logged in; demo=login → shows login screen (no token)
                if (demoMode === '1') {
                  try {
                    document.cookie = 'bearerToken=demo-token; path=/; max-age=86400; SameSite=Strict';
                  } catch (e) {}
                } else {
                  // Clear any existing token for the login screenshot
                  try {
                    document.cookie = 'bearerToken=; path=/; max-age=0; SameSite=Strict';
                  } catch (e) {}
                }

                var mockUser = {
                  email: 'kevin.demo@invincible-voice.com',
                  user_id: 'demo-user-000-0000-000000',
                  is_admin: true,
                  conversations: [],
                  user_settings: {
                    name: 'Kevin',
                    expected_transcription_language: 'fr',
                    voice: 'd5HyIvCEW_x4BkDk',
                    speech_rate: 1.0,
                    learn_style: 'concise',
                    system_prompt: 'Tu es un assistant vocal aide-soignant. Tu reponds en francais de maniere concise et chaleureuse.',
                    keywords: ['repos', 'douleur', 'medecin', 'famille', 'faim', 'soif'],
                    additional_keywords: ['repos', 'douleur', 'medecin', 'famille', 'faim', 'soif'],
                    friends: [],
                    quick_phrases: [
                      { text: 'Bonjour, comment allez-vous ?', category: 'Salutations' },
                      { text: 'Merci beaucoup', category: 'Politesse' },
                      { text: "J'ai besoin d'aide", category: 'Urgence' },
                      { text: 'Pouvez-vous repeter ?', category: 'Communication' },
                      { text: 'Je voudrais boire de l eau', category: 'Besoin' },
                      { text: 'A demain', category: 'Au revoir' }
                    ],
                    appointments: [],
                    documents: [],
                    accepted_terms_of_services: true,
                    prompt: '',
                    language: 'fr',
                    tts_voice_id: null,
                    voice_name: null,
                    custom_voice_samples: null,
                    temperature: 0.7,
                    top_k: 5,
                    max_tokens: 200,
                    memory_enabled: true
                  },
                  memory: { facts: [], tone_profile: '', style_exchanges: [] }
                };

                var origFetch = window.fetch;
                // Cache mock responses so React doesn't re-render in a loop
                // (response.json() creates a new object reference each time,
                //  which would reset component state like the active settings tab).
                var mockUserJson = JSON.stringify(mockUser);
                var mockUsersListJson = JSON.stringify([
                      { email: 'kevin.demo@invincible-voice.com', is_admin: true, has_password: true, has_google: false, display_name: 'Kevin' },
                      { email: 'marie.dupont@invincible-voice.com', is_admin: false, has_password: true, has_google: false, display_name: 'Marie Dupont' }
                ]);
                window.fetch = function(input, init) {
                  var url = typeof input === 'string' ? input : (input && input.url) || '';
                  // User profile — 401 in login demo mode (no token), 200 otherwise
                  if (url.indexOf('/v1/user/') !== -1 && url.indexOf('conversations') === -1 && url.indexOf('settings') === -1 && url.indexOf('accept_terms') === -1 && url.indexOf('anonymous') === -1) {
                    if (demoMode === 'login') {
                      return Promise.resolve(new Response('{"detail":"Invalid token"}', { status: 401, headers: { 'Content-Type': 'application/json' } }));
                    }
                    return Promise.resolve(new Response(mockUserJson, { status: 200, headers: { 'Content-Type': 'application/json' } }));
                  }
                  // Health
                  if (url.indexOf('/v1/health') !== -1) {
                    return Promise.resolve(new Response(JSON.stringify({ ok: true, stt_up: true, llm_up: true }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
                  }
                  // Auth
                  if (url.indexOf('/auth/allow-password') !== -1) {
                    return Promise.resolve(new Response(JSON.stringify({ allow_password: true }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
                  }
                  if (url.indexOf('/auth/google-client-id') !== -1) {
                    return Promise.resolve(new Response(JSON.stringify({ google_client_id: '' }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
                  }
                  if (url.indexOf('/auth/login') !== -1) {
                    return Promise.resolve(new Response(JSON.stringify({ access_token: 'demo-token', token_type: 'bearer' }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
                  }
                  // Settings POST
                  if (url.indexOf('/v1/user/settings') !== -1) {
                    return Promise.resolve(new Response('{"ok":true}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
                  }
                  // Accept terms
                  if (url.indexOf('/accept_terms_of_services') !== -1) {
                    return Promise.resolve(new Response('{"ok":true}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
                  }
                  // Voices
                  if (url.indexOf('/v1/voices') !== -1 && url.indexOf('select') === -1 && url.indexOf('clone') === -1) {
                    return Promise.resolve(new Response(JSON.stringify({ 'd5HyIvCEW_x4BkDk': 'Default Male', 'vFGJKx4j5k2nQ': 'Claire' }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
                  }
                  // Admin users list
                  if (url.indexOf('/v1/admin/users') !== -1 && (!init || init.method !== 'POST')) {
                    return Promise.resolve(new Response(mockUsersListJson, { status: 200, headers: { 'Content-Type': 'application/json' } }));
                  }
                  // Voice select POST
                  if (url.indexOf('/v1/voices/select') !== -1) {
                    return Promise.resolve(new Response(JSON.stringify({ voice: 'vMYQUSzm6GRkJX6d' }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
                  }
                  // Voice clone POST
                  if (url.indexOf('/v1/voices/clone') !== -1) {
                    return Promise.resolve(new Response(JSON.stringify({ voice: 'vCLONED123' }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
                  }
                  // Voice delete DELETE
                  if (url.indexOf('/v1/voices/') !== -1) {
                    return Promise.resolve(new Response('{"ok":true}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
                  }
                  // Admin create/update/delete user (POST/PATCH/DELETE)
                  if (url.indexOf('/v1/admin/users') !== -1) {
                    return Promise.resolve(new Response('{"ok":true}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
                  }
                  // Default: pass through
                  return origFetch.call(this, input, init);
                };
                console.log('[demo] Mock backend installed');
              })();
              // === END DEMO MODE ===

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

              // Capacitor safe-area injection expects document.head; ensure it exists early.
              if (typeof document !== 'undefined' && document.documentElement && !document.head) {
                document.documentElement.prepend(document.createElement('head'));
              }
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
