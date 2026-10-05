import { describe, expect, it } from 'vitest';
import { parseShotInput, shotParams, makeRound, SWIPE_SPEED } from './sim';
import { effectiveMs, resamplePath, smoothPoint, swipeToInput, type GoalFrame, type ScreenPoint } from './swipe';

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

  it('ekran → kale düzlemi (cm, tam sayı): yukarı kaydırma y artar, sağa z artar; sunucu biçimine uyar', () => {
    // Topun üstünden (kale çizgisinin 240 px altı) kalenin sağ üstüne
    const path: ScreenPoint[] = Array.from({ length: 30 }, (_, i) => ({ x: 500 + i * 3, y: 540 - i * 10 }));
    const input = swipeToInput(path, 180, frame, 123.9)!;
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
    expect(swipeToInput(path.slice(0, 1), 180, frame, 0)).toBeNull();
  });

  it('kavisli kaydırma falso üretir', () => {
    const path: ScreenPoint[] = Array.from({ length: 40 }, (_, i) => {
      const u = i / 39;
      return { x: 500 + Math.sin(Math.PI * u) * 70, y: 540 - u * 290 };
    });
    const p = shotParams(makeRound(1, 0), swipeToInput(path, 200, frame, 0)!)!;
    expect(p.curve).toBeLessThan(-0.3); // sağa bombe → sola kıvrılır
  });

  it('güç en yüksek hızdan: etkin süre = kiriş / en yüksek hız → bekleyip nişan düzeltmek gücü düşürmez', () => {
    const path: ScreenPoint[] = [
      { x: 500, y: 540 },
      { x: 500, y: 300 },
    ];
    // 240 px kiriş, en yüksek hız 1,5 px/ms → 160 ms (parmak sonradan 2 sn bekletilse de aynı)
    expect(effectiveMs(path, 1.5)).toBe(160);
    const fast = shotParams(makeRound(1, 0), swipeToInput(path, effectiveMs(path, 1.5), frame, 0)!)!;
    const slow = shotParams(makeRound(1, 0), swipeToInput(path, effectiveMs(path, 0.3), frame, 0)!)!;
    // 240 px = 800 cm; 800 / 160 = 5 cm/ms ≥ üst sınır → tam güç
    expect(800 / 160).toBeGreaterThanOrEqual(SWIPE_SPEED.max);
    expect(fast.power).toBe(1);
    expect(slow.power).toBeLessThan(0.2);
    expect(effectiveMs(path, 0)).toBe(3000); // hiç hızlanmadı: en güçsüz
    expect(effectiveMs(path, 1000)).toBe(30);
  });

  it('yumuşatma: küçük titreme yok sayılır (ölü bölge); yavaşta ağır, hızlı fiskede gecikmesiz', () => {
    const prev = { x: 100, y: 100 };
    expect(smoothPoint(prev, { x: 101.5, y: 101 }, 0.01)).toBe(prev);
    const slow = smoothPoint(prev, { x: 120, y: 100 }, 0.02);
    expect(slow.x).toBeGreaterThan(100);
    expect(slow.x).toBeLessThan(108);
    expect(smoothPoint(prev, { x: 120, y: 100 }, 2)).toEqual({ x: 120, y: 100 });
  });
});
