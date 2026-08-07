import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import {
  loadProductionEnv,
  requireBackendUrl,
} from './load-production-env.mjs';
import { runLocalBin } from './run-local-bin.mjs';
import { resolveJavaHome } from './resolve-keytool.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const androidDir = join(root, 'android');

function gradleWrapper() {
  return process.platform === 'win32'
    ? join(androidDir, 'gradlew.bat')
    : join(androidDir, 'gradlew');
}

function ensureReleaseKeystore() {
  const keystoreProps = join(androidDir, 'keystore.properties');
  if (!existsSync(keystoreProps)) {
    console.error(
      [
        'Missing android/keystore.properties.',
        'Copy keystore.properties.example, create the keystore, then retry.',
        'See android/README.md → « Publication Play Store ».',
      ].join(' '),
    );
    process.exit(1);
  }
}

const env = loadProductionEnv();
requireBackendUrl(env);
ensureReleaseKeystore();

if (!env.CAPACITOR_SERVER_URL) {
  env.NEXT_OUTPUT = env.NEXT_OUTPUT ?? 'export';
  const build = runLocalBin('next', ['build'], { cwd: root, env });
  if (build.status !== 0) {
    process.exit(build.status ?? 1);
  }
}

const sync = runLocalBin('cap', ['sync', 'android'], { cwd: root, env });
if (sync.status !== 0) {
  process.exit(sync.status ?? 1);
}

const javaHome = resolveJavaHome();
if (!javaHome) {
  console.error(
    'JAVA_HOME introuvable. Installez Android Studio ou définissez JAVA_HOME.',
  );
  process.exit(1);
}

const gradleEnv = { ...process.env, ...env, JAVA_HOME: javaHome };

const gradle = spawnSync(
  gradleWrapper(),
  ['bundleRelease'],
  {
    cwd: androidDir,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: gradleEnv,
  },
);

if (gradle.status !== 0) {
  process.exit(gradle.status ?? 1);
}

const aab = join(
  androidDir,
  'app',
  'build',
  'outputs',
  'bundle',
  'release',
  'app-release.aab',
);

console.log(
  [
    '',
    'Release AAB built successfully:',
    `  ${aab}`,
    '',
    'Upload this file to Google Play Console (closed testing track).',
    'Increment versionCode in android/version.properties before each upload.',
    '',
  ].join('\n'),
);
