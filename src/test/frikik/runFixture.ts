/**
 * Test fikstürü: verilen tohum için gerçek simülasyonla bulunmuş, canları bitmiş bir koşu (en az bir gol). Sunucu
 * doğrulaması testlerinde "oynanmış" girdi olarak kullanılır (sim.test.ts'teki arama yöntemiyle aynı).
 */
import { SWIPE_SPEED, makeLevelRound, simulateShot, type ShotInput } from '@/lib/frikik/sim';

const msFor = (targetZ: number, targetY: number, power: number) =>
  Math.round(Math.hypot(targetZ * 100, targetY * 100 + 800) / (SWIPE_SPEED.min + (SWIPE_SPEED.max - SWIPE_SPEED.min) * power));

export function swipe(targetZ: number, targetY: number, ms: number, bulge = 0, tick = 0): ShotInput {
  const sz = 0;
  const sy = -800;
  const cz = targetZ * 100 - sz;
  const cy = targetY * 100 - sy;
  const len = Math.hypot(cz, cy);
  const pts: [number, number][] = [];
  for (let i = 0; i < 16; i++) {
    const u = i / 15;
    const off = bulge * len * Math.sin(Math.PI * u);
    pts.push([Math.round(sz + cz * u + (cy / len) * off), Math.round(sy + cy * u - (cz / len) * off)]);
  }
  return { tick, ms, pts };
}

/** Seviyede gol olan / olmayan bir girdi (belirlenimci ızgara araması). */
export function findShot(seed: number, level: number, wantGoal: boolean): ShotInput {
  const round = makeLevelRound(seed, level);
  for (const z of [2.6, -2.6, 3.0, -3.0, 2.2, -2.2, 0, 3.3, -3.3])
    for (const y of [1.0, 1.8, 0.5])
      for (const p of [0.75, 0.6, 0.9])
        for (const b of [0, 0.1, -0.1])
          for (const ms of [msFor(z, y, p), 140, 200, 280, 400]) {
            const input = swipe(z, y, ms, b, 30);
            if ((simulateShot(round, input).kind === 'goal') === wantGoal) return input;
          }
  throw new Error(`seviye ${level}: ${wantGoal ? 'gol' : 'kaçırma'} bulunamadı`);
}

/** Bitmiş koşu: 1. seviyede gol, 2. seviyede üç kaçırma → seviye 2, 1 geçilmiş, 0 can. */
export function finishedRun(seed: number): ShotInput[] {
  const g1 = findShot(seed, 1, true);
  const m2 = findShot(seed, 2, false);
  return [g1, m2, m2, m2];
}
