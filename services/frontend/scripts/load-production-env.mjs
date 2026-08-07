import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadEnvFile(path) {
  if (!existsSync(path)) {
    return {};
  }

  const vars = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) {
      continue;
    }
    const eq = trimmed.indexOf('=');
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    vars[key] = value;
  }
  return vars;
}

/**
 * Load production env vars for static export / Capacitor builds.
 * Priority: explicit path > .env.production.local > .env.android.local
 */
export function loadProductionEnv(extraPaths = []) {
  const candidates = [
    join(root, '.env.android.local'),
    join(root, '.env.production.local'),
    ...extraPaths,
  ];

  const merged = {};
  for (const path of candidates) {
    Object.assign(merged, loadEnvFile(path));
  }

  return { ...merged, ...process.env };
}

export function requireBackendUrl(env) {
  if (!env.NEXT_PUBLIC_BACKEND_URL && !env.CAPACITOR_SERVER_URL) {
    console.error(
      [
        'Missing NEXT_PUBLIC_BACKEND_URL for a production build.',
        'Copy services/frontend/.env.production.example to .env.production.local',
        'and set your Cloud Run backend URL (no /api suffix).',
      ].join(' '),
    );
    process.exit(1);
  }
}
