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

const result = runLocalBin('next', ['build'], {
  cwd: root,
  env: { ...env, NEXT_OUTPUT: 'export' },
});

process.exit(result.status ?? 1);
