import { readdirSync, readFileSync, statSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

/**
 * Sayfaya özel TR namespace'ler yalnız kullanan modülden yan etkiyle kaydediliyor (bkz. lib/i18nRegistry.ts).
 * Kayıt unutulursa o sayfada TR metin yerine anahtar adı görünür (SSR dahil) → her kullanım dosyası kendi
 * kaydını import etmeli. EN'de her namespace tek parça yüklendiği için ayrıca kontrol gerekmez.
 */
const CORE = new Set(['common', 'nav', 'match', 'leagues', 'gundem']);
const SRC = path.resolve(__dirname, '..');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?|jsx?)$/.test(name) && !/\.test\./.test(name)) out.push(p);
  }
  return out;
}

describe('i18n namespace kayıtları', () => {
  it('temel olmayan her useTranslation(ns) kullanımı lib/i18nNamespaces/<ns> kaydını import ediyor', () => {
    const missing: string[] = [];
    for (const file of walk(SRC)) {
      const src = readFileSync(file, 'utf8');
      for (const m of src.matchAll(/useTranslation\(\s*['"]([a-zA-Z]+)['"]\s*\)/g)) {
        const ns = m[1]!;
        if (CORE.has(ns)) continue;
        if (!src.includes(`@/lib/i18nNamespaces/${ns}`)) missing.push(`${path.relative(SRC, file)} → ${ns}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('her kayıt modülünün JSON\'u mevcut ve EN paketi aynı namespace\'leri içeriyor', () => {
    const dir = path.join(SRC, 'lib/i18nNamespaces');
    const english = readFileSync(path.join(SRC, 'lib/i18nEnglish.ts'), 'utf8');
    for (const file of readdirSync(dir)) {
      const ns = file.replace(/\.ts$/, '');
      expect(readFileSync(path.join(dir, file), 'utf8')).toContain(`locales/tr/${ns}.json`);
      expect(english).toContain(`locales/en/${ns}.json`);
    }
    for (const ns of CORE) expect(english).toContain(`locales/en/${ns}.json`);
  });
});
