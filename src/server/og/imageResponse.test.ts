import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Node'da çizen paylaşım görselleri `next/og`'u DOĞRUDAN kullanmamalı: motoru koşullu dinamik import ile yüklüyor,
 * Vercel dosya izlemesi motoru ve wasm dosyalarını fonksiyona koymuyor (üretimde her çizim hata, yerelde çalışır).
 * Bkz. imageResponse.ts.
 */
describe('og çizim motoru importu', () => {
  it("server/og ve api/og altında 'next/og' importu yok (imageResponse.ts kullanılır)", () => {
    const roots = ['src/server/og', 'src/pages/api/og'];
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(e.name) && !e.name.endsWith('.test.ts') && /from 'next\/og'/.test(readFileSync(p, 'utf8'))) {
          offenders.push(p);
        }
      }
    };
    roots.forEach((r) => walk(path.join(process.cwd(), r)));
    expect(offenders).toEqual([]);
  });
});
