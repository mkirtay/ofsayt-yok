/**
 * Karşılaştırma koşuları (belirlenimci, Node'da üretilir): 36 farklı gün tohumu.
 * - A ailesi (18 gün): LCG'den üretilmiş karışık vuruşlar (hedef / güç / falso / bırakma tick'i rastgele) → gol,
 *   kurtarış, baraj, direk, dışarı karışık; canlar bitene kadar.
 * - B ailesi (18 gün): seviye tırmanışı — k seviyeye kadar gol (k = 2…12), arada bir kaçırma, sonra canlar bitene kadar
 *   kaçırma → yüksek seviyelerin kaldıraçları (rüzgâr, daralan kale, hareketli baraj, hızlı kaleci) kapsanır.
 */
import { dailySeed, parseDayKey } from '@/lib/frikik/daily';
import { LIVES, scoreLevelRun, type ShotInput } from '@/lib/frikik/sim';
import { findShot, swipe } from '@/test/frikik/runFixture';
import type { RunCase } from './trace';

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function randomRun(seed: number, salt: number): ShotInput[] {
  const rnd = lcg(seed ^ salt);
  const shots: ShotInput[] = [];
  for (let i = 0; i < 40; i++) {
    const z = -3.6 + rnd() * 7.2;
    const y = 0.3 + rnd() * 2.0;
    const ms = Math.round(100 + rnd() * 500);
    const bulge = -0.35 + rnd() * 0.7;
    const tick = Math.floor(rnd() * 300);
    shots.push(swipe(z, y, ms, bulge, tick));
    if (scoreLevelRun(seed, shots).lives === 0) break;
  }
  return shots;
}

function climbRun(seed: number, k: number): ShotInput[] {
  const shots: ShotInput[] = [];
  for (let level = 1; level <= k; level++) {
    if (level === Math.max(2, Math.floor(k / 2))) shots.push(findShot(seed, level, false)); // arada bir can kaybı
    shots.push(findShot(seed, level, true));
  }
  for (let i = 0; i < LIVES; i++) shots.push(findShot(seed, k + 1, false));
  return shots;
}

export function buildCases(): RunCase[] {
  const cases: RunCase[] = [];
  const start = parseDayKey('2026-10-01')!;
  for (let i = 0; i < 36; i++) {
    const day = start + i;
    const seed = dailySeed(day);
    const family = i % 2 === 0 ? 'A' : 'B';
    const inputs = family === 'A' ? randomRun(seed, 0x51ed27 + i) : climbRun(seed, 2 + ((i >> 1) % 6) * 2);
    cases.push({ id: `${family}-d${day}`, seed, inputs });
  }
  return cases;
}
