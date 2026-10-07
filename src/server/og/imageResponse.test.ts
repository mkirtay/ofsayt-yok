import { existsSync, readdirSync, readFileSync } from 'node:fs';
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

/**
 * Üretim build'i varsa (`next build` sonrası) her OG ucunun dosya izlemesi çizim motorunu ve wasm dosyalarını içermeli —
 * Vercel fonksiyona yalnız bu listedekileri koyar. Build yoksa (yalnız birim test) atlanır.
 */
describe('og uçlarının nft izlemesi (build varsa)', () => {
  const distDir = path.join(process.cwd(), process.env.NEXT_DIST_DIR || '.next');
  const routes = ['frikik', 'match/[id]', 'team/[id]'];
  const traces = routes.map((r) => path.join(distDir, 'server/pages/api/og', `${r}.js.nft.json`));
  const built = traces.every((t) => existsSync(t));

  it.skipIf(!built)('index.node.js, resvg.wasm, yoga.wasm izleniyor', () => {
    for (const t of traces) {
      const files = (JSON.parse(readFileSync(t, 'utf8')) as { files: string[] }).files;
      for (const need of ['@vercel/og/index.node.js', '@vercel/og/resvg.wasm', '@vercel/og/yoga.wasm']) {
        expect(files.some((f) => f.endsWith(need)), `${path.relative(distDir, t)} → ${need}`).toBe(true);
      }
    }
  });
});

describe('next/og ve @vercel/og yalnız imageResponse.ts üzerinden', () => {
  it("src altında başka dosya 'next/og' ya da '@vercel/og' import etmiyor", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(ts|tsx|js|mjs)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) && !p.endsWith(path.join('og', 'imageResponse.ts'))) {
          if (/from ['"](next\/og|@vercel\/og)['"]|import\(['"](next\/og|@vercel\/og)/.test(readFileSync(p, 'utf8'))) offenders.push(p);
        }
      }
    };
    walk(path.join(process.cwd(), 'src'));
    expect(offenders).toEqual([]);
  });

  it('imageResponse.ts motoru statik import ediyor (nft izleyebilsin)', () => {
    const src = readFileSync(path.join(process.cwd(), 'src/server/og/imageResponse.ts'), 'utf8');
    expect(src).toMatch(/^export \{ ImageResponse \} from 'next\/dist\/compiled\/@vercel\/og\/index\.node\.js';$/m);
  });
});
