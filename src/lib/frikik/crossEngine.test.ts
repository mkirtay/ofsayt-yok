import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { SIM_VERSION } from './sim';
import { runCases, type RunCase, type RunTrace } from '../../../scripts/frikik-cross-engine/trace';

/**
 * Altın koşu izleri (scripts/frikik-cross-engine, `--write-golden` ile Node'da üretildi; Chromium / Firefox / WebKit'te
 * bit düzeyinde aynı çıktı doğrulandı). Bu test: (1) simülasyon değişince altın dosya ve SIM_VERSION birlikte güncellenmeli
 * (eski kayıtlar yeniden üretilemez), (2) Node çıktısı altın dosyayla bit düzeyinde aynı (determinizm bozulmadı).
 * Motorlar arası karşılaştırma ağır (3 tarayıcı) → ayrı komut: `npm run test:frikik-engines`.
 */
describe('frikik motorlar arası altın koşular', () => {
  const golden = JSON.parse(readFileSync(path.join(process.cwd(), 'src/lib/frikik/__fixtures__/crossEngine.golden.json'), 'utf8')) as {
    simVersion: number;
    cases: RunCase[];
    runs: RunTrace[];
  };

  it('altın dosya güncel SIM_VERSION ile üretilmiş (sim değiştiyse `npm run test:frikik-engines -- --write-golden` + sürüm artışı)', () => {
    expect(golden.simVersion).toBe(SIM_VERSION);
  });

  it('Node çıktısı altın dosyayla bit düzeyinde aynı (36 koşu, karışık sonuçlar)', () => {
    const now = runCases(golden.cases);
    expect(golden.runs.length).toBeGreaterThanOrEqual(30);
    expect(JSON.stringify(now.runs)).toBe(JSON.stringify(golden.runs));
    const kinds = new Set(golden.runs.flatMap((r) => r.shots.map((s) => s.kind)));
    expect([...kinds].sort()).toEqual(['goal', 'miss', 'post', 'saved', 'wall']);
  });
});
