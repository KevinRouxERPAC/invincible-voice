import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runLocalBin } from './run-local-bin.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const envFile = join(root, '.env.android.local');

function loadEnvFile(path) {
  if (!existsSync(path)) {
    return {};
  }

  const vars = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const eq = trimmed.indexOf('=');
    if (eq === -1) {
      continue;
    }
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    vars[key] = value;
  }
  return vars;
}

const fileEnv = loadEnvFile(envFile);
const env = { ...process.env, ...fileEnv };

if (!env.NEXT_PUBLIC_BACKEND_URL && !env.CAPACITOR_SERVER_URL) {
  console.error(
    [
      'Missing NEXT_PUBLIC_BACKEND_URL.',
      'Copy .env.android.example to .env.android.local and set your backend URL,',
      'or set CAPACITOR_SERVER_URL for live-reload against the dev server.',
    ].join(' '),
  );
  process.exit(1);
}

if (!env.CAPACITOR_SERVER_URL) {
  env.NEXT_OUTPUT = env.NEXT_OUTPUT ?? 'export';
  const build = runLocalBin('next', ['build'], { cwd: root, env });
  if (build.status !== 0) {
    process.exit(build.status ?? 1);
  }
}

const sync = runLocalBin('cap', ['sync', 'android'], { cwd: root, env });
process.exit(sync.status ?? 1);
