import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runKeytool } from './resolve-keytool.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const androidDir = join(root, 'android');

function gradleWrapper() {
  return process.platform === 'win32'
    ? join(androidDir, 'gradlew.bat')
    : join(androidDir, 'gradlew');
}

function loadKeystoreProperties() {
  const path = join(androidDir, 'keystore.properties');
  if (!existsSync(path)) {
    console.error(
      [
        'Missing android/keystore.properties for a signed release build.',
        'Copy android/keystore.properties.example → android/keystore.properties',
        'and create the release keystore (see android/README.md).',
      ].join(' '),
    );
    process.exit(1);
  }

  const props = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) {
      continue;
    }
    const eq = trimmed.indexOf('=');
    props[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return props;
}

const props = loadKeystoreProperties();
const storeFile = join(androidDir, props.storeFile);
if (!existsSync(storeFile)) {
  console.error(`Keystore not found: ${storeFile}`);
  process.exit(1);
}

const result = runKeytool([
  '-list',
  '-v',
  '-keystore',
  storeFile,
  '-alias',
  props.keyAlias,
  '-storepass',
  props.storePassword,
]);

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

console.log(
  [
    '',
    '→ Enregistrez l’empreinte SHA-1 ci-dessus dans Google Cloud Console',
    '  (Identifiants OAuth → client Android, package com.invinciblevoice.app).',
    '→ Après la première publication Play Store, ajoutez aussi l’empreinte SHA-1',
    '  « App signing key certificate » (Play Console → Intégrité de l’app).',
    '',
  ].join('\n'),
);
