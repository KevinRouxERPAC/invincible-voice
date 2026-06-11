import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function binPath(name) {
  const win = process.platform === 'win32';
  const candidate = join(root, 'node_modules', '.bin', win ? `${name}.cmd` : name);
  return existsSync(candidate) ? candidate : name;
}

export function runLocalBin(name, args, options = {}) {
  const { cwd = root, env = process.env, stdio = 'inherit' } = options;
  return spawnSync(binPath(name), args, {
    cwd,
    env,
    stdio,
    shell: process.platform === 'win32',
  });
}
