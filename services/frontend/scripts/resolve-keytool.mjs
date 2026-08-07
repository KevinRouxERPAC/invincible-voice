import { existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const isWin = process.platform === 'win32';
const keytoolName = isWin ? 'keytool.exe' : 'keytool';

function fromJavaHome() {
  const home = process.env.JAVA_HOME;
  if (!home) {
    return null;
  }
  const candidate = join(home, 'bin', keytoolName);
  return existsSync(candidate) ? candidate : null;
}

function commonInstallPaths() {
  if (!isWin) {
    return [];
  }
  const programFiles = process.env['ProgramFiles'] ?? 'C:\\Program Files';
  const localAppData = process.env.LOCALAPPDATA ?? '';
  return [
    join(programFiles, 'Android', 'Android Studio', 'jbr', 'bin', keytoolName),
    join(localAppData, 'Programs', 'Android Studio', 'jbr', 'bin', keytoolName),
  ];
}

function findUnderJavaDir(dir) {
  if (!existsSync(dir)) {
    return null;
  }
  for (const entry of readdirSync(dir)) {
    const candidate = join(dir, entry, 'bin', keytoolName);
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

export function resolveKeytool() {
  const fromHome = fromJavaHome();
  if (fromHome) {
    return fromHome;
  }

  for (const path of commonInstallPaths()) {
    if (existsSync(path)) {
      return path;
    }
  }

  const programFiles = process.env['ProgramFiles'] ?? 'C:\\Program Files';
  const fromJavaDir = findUnderJavaDir(join(programFiles, 'Java'));
  if (fromJavaDir) {
    return fromJavaDir;
  }

  const which = spawnSync(isWin ? 'where' : 'which', [keytoolName.replace('.exe', '')], {
    encoding: 'utf8',
    shell: isWin,
  });
  if (which.status === 0 && which.stdout.trim()) {
    const first = which.stdout.trim().split(/\r?\n/)[0];
    if (existsSync(first)) {
      return first;
    }
  }

  return null;
}

export function resolveJavaHome() {
  if (process.env.JAVA_HOME) {
    return process.env.JAVA_HOME;
  }
  const keytool = resolveKeytool();
  if (keytool) {
    return dirname(dirname(keytool));
  }
  return null;
}

export function runKeytool(args, options = {}) {
  const keytool = resolveKeytool();
  if (!keytool) {
    console.error(
      [
        'keytool introuvable.',
        'Installez un JDK (Android Studio inclut le JBR) ou définissez JAVA_HOME, par ex. :',
        '  $env:JAVA_HOME = "C:\\Program Files\\Android\\Android Studio\\jbr"',
      ].join('\n'),
    );
    process.exit(1);
  }

  return spawnSync(keytool, args, {
    stdio: 'inherit',
    shell: false,
    ...options,
  });
}
