import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runKeytool } from './resolve-keytool.mjs';

const androidDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'android');
const keystoreDir = join(androidDir, 'keystore');
const keystoreFile = join(keystoreDir, 'invincible-release.keystore');

if (existsSync(keystoreFile)) {
  console.error(`Keystore already exists: ${keystoreFile}`);
  console.error('Delete it first if you really want to regenerate.');
  process.exit(1);
}

console.log(
  [
    'Création du keystore de release Android.',
    'keytool va demander un mot de passe (keystore + clé) et quelques infos (CN, etc.).',
    'Conservez ces mots de passe pour android/keystore.properties.',
    '',
  ].join('\n'),
);

const result = runKeytool([
  '-genkey',
  '-v',
  '-keystore',
  keystoreFile,
  '-alias',
  'invincible',
  '-keyalg',
  'RSA',
  '-keysize',
  '2048',
  '-validity',
  '10000',
]);

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

const propsExample = join(androidDir, 'keystore.properties.example');
const propsFile = join(androidDir, 'keystore.properties');

console.log(
  [
    '',
    `Keystore créé : ${keystoreFile}`,
    existsSync(propsFile)
      ? 'keystore.properties existe déjà — vérifiez les mots de passe.'
      : `Copiez ${propsExample} → keystore.properties et renseignez les mots de passe.`,
    'Puis : pnpm android:sha1',
    '',
  ].join('\n'),
);
