import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadProductionEnv,
  requireBackendUrl,
} from './load-production-env.mjs';
import { runLocalBin } from './run-local-bin.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = loadProductionEnv();

requireBackendUrl(env);

if (!env.CAPACITOR_SERVER_URL) {
  env.NEXT_OUTPUT = env.NEXT_OUTPUT ?? 'export';
  const build = runLocalBin('next', ['build'], { cwd: root, env });
  if (build.status !== 0) {
    process.exit(build.status ?? 1);
  }
}

const sync = runLocalBin('cap', ['sync', 'android'], { cwd: root, env });
process.exit(sync.status ?? 1);
