import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Tasarım sistemi "cırcır" testi (2026-11-20 denetimi, docs/DENETIM_RAPORU_2026-11-20.md U3): SCSS'te token dışı ham
 * değerler bugünkü sayının ÜSTÜNE çıkamaz, ölçek dışı yeni yazı boyutu eklenemez. Bir stili token'a taşıdığınızda
 * sayı düşer — aşağıdaki tavanı da aynı commit'te düşürün (tavan hep güncel sayıya eşit kalsın).
 *
 * Neden toplu değiştirme yok: ~1.300 satırlık mekanik değişiklik açık dallarla çakışırdı; yeni kod token kullanır,
 * eskiler dokunulan dosyada taşınır.
 */

const SRC = path.resolve(__dirname, '..');

function scssFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) scssFiles(p, out);
    else if (name.endsWith('.scss')) out.push(p);
  }
  return out;
}

const files = scssFiles(SRC).map((p) => ({ p, rel: path.relative(SRC, p), s: readFileSync(p, 'utf8') }));
const isTokenFile = (rel: string) => /styles\/_(tokens|variables)\.scss$/.test(rel);

/** Ham px yazı boyutu tavanı (token / değişken kullanımı sayılmaz). */
const RAW_FONT_SIZE_MAX = 1303;
/** Token dosyaları dışındaki hex ve rgb()/rgba() renk tavanları. */
const RAW_HEX_MAX = 472;
const RAW_RGBA_MAX = 437;

/**
 * İzinli yazı boyutları (px). Merdiven: 10 label · 11 micro · 12 caption · 13 meta · 14 body · 15 section · 16 title,
 * üstü başlık / skor. Listede olup merdivende olmayan küsuratlı / ara değerler eski kod — yenisi eklenmez.
 */
const ALLOWED_FONT_PX = new Set([
  // merdiven + başlık / skor
  10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 24, 26, 28, 30, 32, 36, 40,
  // eski / özel (sabit boyutlu rozet, saha çizimi, dev rakam) — yenisi eklenmez
  7, 8, 9, 10.5, 11.5, 12.5, 13.5, 17, 19, 21, 34, 54, 56, 60, 64, 72, 96,
]);

describe('tasarım token cırcırı', () => {
  const fontSizes = files.flatMap(({ rel, s }) => [...s.matchAll(/font-size:\s*([0-9.]+)px/g)].map((m) => ({ rel, px: Number(m[1]) })));

  it('ham px font-size sayısı artmaz', () => {
    expect(fontSizes.length).toBeLessThanOrEqual(RAW_FONT_SIZE_MAX);
  });

  it('ölçek dışı yeni yazı boyutu yok', () => {
    const off = fontSizes.filter((f) => !ALLOWED_FONT_PX.has(f.px)).map((f) => `${f.rel}: ${f.px}px`);
    expect(off).toEqual([]);
  });

  it('token dosyaları dışındaki sabit renk sayısı artmaz', () => {
    const others = files.filter((f) => !isTokenFile(f.rel));
    const hex = others.reduce((n, f) => n + (f.s.match(/#[0-9a-fA-F]{3,8}\b/g)?.length ?? 0), 0);
    const rgba = others.reduce((n, f) => n + (f.s.match(/rgba?\(/g)?.length ?? 0), 0);
    expect(hex).toBeLessThanOrEqual(RAW_HEX_MAX);
    expect(rgba).toBeLessThanOrEqual(RAW_RGBA_MAX);
  });

  it('yazı merdiveni token\'ları tanımlı', () => {
    const tokens = files.find((f) => f.rel.endsWith('styles/_tokens.scss'))!.s;
    for (const t of ['--fs-label', '--fs-micro', '--fs-caption', '--fs-meta', '--fs-body', '--fs-section', '--fs-title', '--fs-score']) {
      expect(tokens, t).toMatch(new RegExp(`${t}:\\s*\\d+px`));
    }
  });
});
