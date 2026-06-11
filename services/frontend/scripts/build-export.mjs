import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runLocalBin } from './run-local-bin.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const result = runLocalBin('next', ['build'], {
  cwd: root,
  env: { ...process.env, NEXT_OUTPUT: 'export' },
});

process.exit(result.status ?? 1);
