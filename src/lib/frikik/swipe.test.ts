import { describe, expect, it } from 'vitest';
import { parseShotInput, shotParams, makeRound } from './sim';
import { resamplePath, swipeToInput, type GoalFrame, type SwipeSample } from './swipe';

const frame: GoalFrame = { originX: 500, originY: 300, pxPerMX: 30, pxPerMY: 30 };

describe('kaydırma → girdi', () => {
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

  it('ekran → kale düzlemi (cm, tam sayı): yukarı kaydırma y artar, sağa z artar; süre ms; sunucu biçimine uyar', () => {
    // Topun üstünden (kale çizgisinin 240 px altı) kalenin sağ üstüne, 180 ms
    const samples: SwipeSample[] = Array.from({ length: 30 }, (_, i) => ({ t: 1000 + i * (180 / 29), x: 500 + i * 3, y: 540 - i * 10 }));
    const input = swipeToInput(samples, frame, 123.9)!;
    expect(input.tick).toBe(123);
    expect(input.ms).toBe(180);
    expect(input.pts).toHaveLength(16);
    expect(input.pts[0]).toEqual([0, -800]);
    expect(input.pts[15]).toEqual([290, 167]);
    for (const [z, y] of input.pts) expect(Number.isInteger(z) && Number.isInteger(y)).toBe(true);
    expect(parseShotInput(JSON.parse(JSON.stringify(input)))).toEqual(input);
    const p = shotParams(makeRound(1, 0), input)!;
    expect(p.targetZ).toBeCloseTo(2.9, 6);
    expect(p.curve).toBe(0);
    expect(swipeToInput(samples.slice(0, 1), frame, 0)).toBeNull();
  });

  it('kavisli kaydırma falso üretir', () => {
    const samples: SwipeSample[] = Array.from({ length: 40 }, (_, i) => {
      const u = i / 39;
      return { t: u * 200, x: 500 + Math.sin(Math.PI * u) * 70, y: 540 - u * 290 };
    });
    const p = shotParams(makeRound(1, 0), swipeToInput(samples, frame, 0)!)!;
    expect(p.curve).toBeLessThan(-0.3); // sağa bombe → sola kıvrılır
  });
});
