import type { NextConfig } from 'next';

// NEXT_OUTPUT=export -> static export for Firebase Hosting / Capacitor (the PWA
// talks to Cloud Run via NEXT_PUBLIC_BACKEND_URL).
// Otherwise -> standalone output for the frontend Docker image.
// On Windows, standalone tracing needs symlinks that often fail locally; use
// static export unless NEXT_OUTPUT=standalone is set explicitly (Docker/Linux).
const isExport =
  process.env.NEXT_OUTPUT === 'export' ||
  (process.platform === 'win32' && process.env.NEXT_OUTPUT !== 'standalone');

const cloudBackend =
  process.env.NEXT_PUBLIC_BACKEND_URL?.replace(/\/$/, '') || '';

const nextConfig: NextConfig = isExport
  ? {
      output: 'export',
      images: { unoptimized: true },
    }
  : {
      output: 'standalone',
      async rewrites() {
        // Local frontend only proxies to the Cloud Run backend — never to a
        // localhost API. Set NEXT_PUBLIC_BACKEND_URL in .env.local.
        if (!cloudBackend) {
          return [];
        }
        return [
          {
            source: '/api/:path*',
            destination: `${cloudBackend}/:path*`,
          },
        ];
      },
    };

export default nextConfig;
