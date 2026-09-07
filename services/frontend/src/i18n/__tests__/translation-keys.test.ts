import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import de from '@/messages/de.json';
import en from '@/messages/en.json';
import es from '@/messages/es.json';
import fr from '@/messages/fr.json';
import pt from '@/messages/pt.json';

// `t()` returns the key itself when it is missing, so a wrong key path ships
// silently and surfaces as raw text in the UI. On-device QA (07/09/26) found
// three of them, one of which was the confirmation text of an irreversible
// action ("delete this cloned voice"). This test walks every literal `t('…')`
// in the source and checks it resolves in all five locales.

const LOCALES = { fr, en, de, es, pt } as Record<
  string,
  Record<string, unknown>
>;

const SRC = join(__dirname, '..', '..');

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      if (entry !== '__tests__' && entry !== '__mocks__') {
        out.push(...sourceFiles(path));
      }
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      out.push(path);
    }
  }
  return out;
}

function usedKeys(): Map<string, string[]> {
  const keys = new Map<string, string[]>();
  for (const file of sourceFiles(SRC)) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/\bt\(\s*'([a-zA-Z0-9_.]+)'/g)) {
      const [, key] = match;
      keys.set(key, [...(keys.get(key) ?? []), file.slice(SRC.length + 1)]);
    }
  }
  return keys;
}

function resolve(messages: Record<string, unknown>, key: string): unknown {
  return key
    .split('.')
    .reduce<unknown>(
      (acc, part) =>
        acc && typeof acc === 'object'
          ? (acc as Record<string, unknown>)[part]
          : undefined,
      messages,
    );
}

describe('translation keys', () => {
  const keys = usedKeys();

  it('finds the translation calls in the source', () => {
    expect(keys.size).toBeGreaterThan(100);
  });

  it.each(Object.keys(LOCALES))('%s defines every key used', (locale) => {
    const missing = [...keys.entries()]
      .filter(([key]) => typeof resolve(LOCALES[locale], key) !== 'string')
      .map(([key, files]) => `${key} (${files.join(', ')})`);

    expect(missing).toEqual([]);
  });
});
