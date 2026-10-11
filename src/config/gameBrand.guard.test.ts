/**
 * Koruma: tahmin oyununun görünen adı (geçici "Tahmin Ligi"; karar yönü "90+") kodda, çevirilerde ve yapılandırmada düz metin
 * olarak geçmesin — ad `config/brand.ts` `GAME_BRAND`'den, metinlerde `{{game}}` / `{{gameShort}}` ile okunur. Ad değişince
 * yalnız o nesne değişir. Kapsam: git'te izlenen metin dosyaları (`docs/` ve package-lock.json hariç); yeni dosya `git add`
 * sonrası girer.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { GAME_BRAND } from './brand';

const ROOT = process.cwd();
const BINARY = /\.(png|jpe?g|gif|webp|avif|ico|svg|woff2?|ttf|otf|mp4|webm|mp3|pdf|glb|gltf|bin)$/i;
/** Geçici ad + kesinleşecek adın yazımları. */
const NAMES = [GAME_BRAND.name, 'Tahmin Ligi', '90arti', '90 Artı'];
const ALLOWED = new Set(['src/config/brand.ts', 'src/config/gameBrand.guard.test.ts']);

const isFile = (f: string) => statSync(path.join(ROOT, f), { throwIfNoEntry: false })?.isFile() ?? false;

function scannedFiles(): string[] {
  return execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
    .filter((f) => !f.startsWith('docs/') && f !== 'package-lock.json' && !BINARY.test(f) && !ALLOWED.has(f) && isFile(f));
}

describe('tahmin oyunu adı yalnız GAME_BRAND\'de', () => {
  it('başka dosyada düz metin olarak geçmez', () => {
    const offenders: string[] = [];
    for (const f of scannedFiles()) {
      const text = readFileSync(path.join(ROOT, f), 'utf8');
      if (text.includes('\u0000')) continue;
      text.split('\n').forEach((line, i) => {
        const hit = NAMES.find((n) => line.toLocaleLowerCase('tr-TR').includes(n.toLocaleLowerCase('tr-TR')));
        if (hit) offenders.push(`${f}:${i + 1}: ${line.trim().slice(0, 120)} → "${hit}"`);
      });
    }
    expect(offenders).toEqual([]);
  });
});
