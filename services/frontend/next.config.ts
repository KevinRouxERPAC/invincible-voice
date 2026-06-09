import type { NextConfig } from 'next';

// NEXT_OUTPUT=export -> static export for Firebase Hosting (the PWA talks to the
// backend directly via NEXT_PUBLIC_BACKEND_URL, so no rewrites are needed).
// Otherwise -> standalone output for the Docker image (Traefik proxies /api).
const isExport = process.env.NEXT_OUTPUT === 'export';

const nextConfig: NextConfig = isExport
  ? {
      output: 'export',
      images: { unoptimized: true },
    }
  : {
      output: 'standalone', // For Docker
      async rewrites() {
        const backendUrl =
          process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
        return [
          {
            source: '/api/:path*',
            destination: `${backendUrl}/:path*`,
          },
        ];
      },
    };

export default nextConfig;
