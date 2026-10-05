import { describe, expect, it } from 'vitest';
import { makeRound, parseShotInput, shotParams } from './sim';
import { flickPx, pullToInput, resamplePath, type ScreenPoint } from './pull';

describe('geri çekme → girdi', () => {
  it('yol yay uzunluğuna göre eşit aralıklı 16 noktaya iner; uçlar korunur', () => {
    const raw = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 100, y: 0 },
    ];
    const out = resamplePath(raw, 16);
    expect(out).toHaveLength(16);
    expect(out[0]).toEqual({ x: 0, y: 0 });
    expect(out[15]!.x).toBeCloseTo(100, 9);
    for (let i = 1; i < 16; i++) expect(out[i]!.x - out[i - 1]!.x).toBeCloseTo(100 / 15, 9);
    expect(resamplePath([{ x: 5, y: 5 }], 16)).toHaveLength(16); // tek nokta: hepsi aynı
  });

  it('ekran pikseli → çekme birimi (tam çekme = 1000), tam sayı; sunucu biçimine uyar', () => {
    // 150 px tam çekme; 30 px sağa, 90 px aşağı çekildi
    const path: ScreenPoint[] = Array.from({ length: 25 }, (_, i) => ({ x: (30 * i) / 24, y: (90 * i) / 24 }));
    const input = pullToInput(path, 21, 150, 123.9)!;
    expect(input.tick).toBe(123);
    expect(input.flick).toBe(140);
    expect(input.pts).toHaveLength(16);
    expect(input.pts[0]).toEqual([0, 0]);
    expect(input.pts[15]).toEqual([200, 600]);
    for (const [x, y] of input.pts) expect(Number.isInteger(x) && Number.isInteger(y)).toBe(true);
    expect(parseShotInput(JSON.parse(JSON.stringify(input)))).toEqual(input);
    const p = shotParams(makeRound(1, 0), input)!;
    expect(p.power).toBeCloseTo(Math.hypot(200, 600) / 1000, 9);
    expect(p.curve).toBeGreaterThan(0);
    expect(pullToInput([], 0, 150, 0)).toBeNull();
  });

  it('yana kıvrım: çekme yönüne dik bileşen, ekran sağı pozitif', () => {
    expect(flickPx({ x: 0, y: 100 }, { x: 25, y: 100 })).toBeCloseTo(25, 9);
    expect(flickPx({ x: 0, y: 100 }, { x: -25, y: 130 })).toBeCloseTo(-25, 9); // çekme yönündeki hareket sayılmaz
    expect(flickPx({ x: 0, y: 0 }, { x: 25, y: 0 })).toBe(0);
    // Eğik çekmede de "sağ" çekmenin sağıdır
    expect(flickPx({ x: 60, y: 80 }, { x: 60 + 8, y: 80 - 6 })).toBeCloseTo(10, 9);
  });
});
