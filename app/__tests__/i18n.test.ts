/// <reference types="node" />
// NFR-06: every screen works in Arabic and English. These checks cover the translation files and the styles;
// the visual check on the phone is docs/nfr-06-checklist.md.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import ar from '../src/i18n/ar.json';
import en from '../src/i18n/en.json';

type Tree = { [key: string]: string | Tree };

function flatten(tree: Tree, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix === '' ? key : `${prefix}.${key}`;
    if (typeof value === 'string') out[path] = value;
    else Object.assign(out, flatten(value, path));
  }
  return out;
}

const enKeys = flatten(en as Tree);
const arKeys = flatten(ar as Tree);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

describe('NFR-06 Arabic and English texts', () => {
  test('NFR-06 every key in en.json exists in ar.json', () => {
    expect(Object.keys(enKeys).filter((key) => !(key in arKeys))).toEqual([]);
  });

  test('NFR-06 every key in ar.json exists in en.json', () => {
    expect(Object.keys(arKeys).filter((key) => !(key in enKeys))).toEqual([]);
  });

  test('NFR-06 no translation value is empty in either language', () => {
    const empty = [
      ...Object.entries(enKeys)
        .filter(([, v]) => v.trim() === '')
        .map(([k]) => `en:${k}`),
      ...Object.entries(arKeys)
        .filter(([, v]) => v.trim() === '')
        .map(([k]) => `ar:${k}`),
    ];
    expect(empty).toEqual([]);
  });

  // US-18 (IF-UI-05): the perishability category tells how soon to collect, never that the food is safe.
  test('NFR-05a no text in en.json or ar.json says the food is safe', () => {
    const english = /\bsafe\b|\bsafely\b|fit to eat|good to eat/i;
    const arabic = /آمن|سليم|صالح للأكل|صالح للاستهلاك/;
    const offenders = [
      ...Object.entries(enKeys).filter(([, v]) => english.test(v)),
      ...Object.entries(arKeys).filter(([, v]) => arabic.test(v)),
    ].map(([k]) => k);
    expect(offenders).toEqual([]);
  });

  test('NFR-06 app styles use start/end, never left/right, so layouts mirror in Arabic', () => {
    const appRoot = join(__dirname, '..');
    const forbidden =
      /\b(marginLeft|marginRight|paddingLeft|paddingRight|borderLeft\w*|borderRight\w*|borderTopLeftRadius|borderTopRightRadius|borderBottomLeftRadius|borderBottomRightRadius|left|right)\s*:/;
    const offenders = [...sourceFiles(join(appRoot, 'app')), ...sourceFiles(join(appRoot, 'src'))].flatMap(
      (file) =>
        readFileSync(file, 'utf8')
          .split('\n')
          .map((line, index) => ({ line, index }))
          .filter(({ line }) => forbidden.test(line))
          .map(({ index }) => `${relative(appRoot, file)}:${index + 1}`),
    );
    expect(offenders).toEqual([]);
  });
});
