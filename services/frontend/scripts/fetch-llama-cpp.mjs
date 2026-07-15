// Fetches the llama.cpp source tree needed by the Android NDK build
// (app/src/main/cpp/CMakeLists.txt does add_subdirectory(llama.cpp)).
//
// llama.cpp is large and changes daily, so it is gitignored and fetched on
// demand rather than vendored. Pin a build tag (e.g. b9900) for reproducible
// builds; pass --ref <git-ref> to override. Re-running is idempotent: if the
// directory already exists and matches the requested ref, it is left as-is.
//
// Usage:
//   node scripts/fetch-llama-cpp.mjs                # uses LLAMA_CPP_REF or default
//   node scripts/fetch-llama-cpp.mjs --ref b9900
//   node scripts/fetch-llama-cpp.mjs --force        # re-clone even if present
import { existsSync, rmSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dest = join(root, 'android', 'app', 'src', 'main', 'cpp', 'llama.cpp');

// Default tag pinned for reproducibility. Bump after verifying the build
// still passes against a newer release.
const DEFAULT_REF = 'b9900';

function parseArgs(argv) {
  const args = { ref: process.env.LLAMA_CPP_REF ?? DEFAULT_REF, force: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--ref') args.ref = argv[++i];
    else if (a === '--force') args.force = true;
    else if (a === '-h' || a === '--help') {
      console.log('Usage: node scripts/fetch-llama-cpp.mjs [--ref <git-ref>] [--force]');
      process.exit(0);
    }
  }
  return args;
}

function run(cmd) {
  execSync(cmd, { stdio: 'inherit' });
}

const { ref, force } = parseArgs(process.argv.slice(2));

function isNonEmpty(dir) {
  return existsSync(dir) && readdirSync(dir).length > 0;
}

if (isNonEmpty(dest) && !force) {
  console.log(`[fetch-llama-cpp] ${dest} already exists; skipping (use --force to re-clone).`);
  process.exit(0);
}

if (existsSync(dest)) {
  console.log(`[fetch-llama-cpp] removing existing ${dest}`);
  rmSync(dest, { recursive: true, force: true });
}

console.log(`[fetch-llama-cpp] cloning llama.cpp @ ${ref} into ${dest}`);
// Shallow clone the specific ref to keep the download small.
run(`git clone --depth 1 --branch ${ref} https://github.com/ggml-org/llama.cpp.git "${dest}"`);
console.log('[fetch-llama-cpp] done.');
