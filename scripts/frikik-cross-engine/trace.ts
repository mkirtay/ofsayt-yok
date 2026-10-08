/**
 * Motorlar arası karşılaştırma için koşu izi: scoreLevelRun ile AYNI döngü (seviye / can / puan), ama her vuruşun
 * karar anındaki iç durumu da (tick, top konumu/hızı, kaleci yeri/hedefi, temas bayrakları, vuruş parametreleri)
 * kaydedilir → fark çıkarsa hangi vuruşta, hangi alanda ve ne kadar olduğu görülür. Node'da (tsx) ve tarayıcıda
 * (esbuild paketi, globalThis.__frikikSim) aynı dosya çalışır. Sayılar olduğu gibi (yuvarlama YOK): bit düzeyinde eşitlik.
 */
import { LIVES, MAX_LEVEL_SHOTS, SIM_VERSION, levelPoints, makeLevelRound, scoreLevelRun, shotParams, startShot, stepShot, type ShotInput } from '@/lib/frikik/sim';

export type ShotTrace = {
  level: number;
  kind: string;
  points: number;
  viaPost: boolean;
  corner: boolean;
  ticks: number;
  keeperZ0: number;
  keeperTarget: number;
  keeperZ: number;
  pos: [number, number, number];
  vel: [number, number, number];
  touched: [boolean, boolean, boolean];
  params: { vel: [number, number, number]; curve: number; power: number; shake: number; yaw: number; lift: number; targetZ: number; arrivalZ: number } | null;
};

export type RunCase = { id: string; seed: number; inputs: ShotInput[] };
export type RunTrace = { id: string; seed: number; level: number; cleared: number; lives: number; total: number; shots: ShotTrace[] };

export function traceRun(c: RunCase): RunTrace {
  let level = 1;
  let lives = LIVES;
  let cleared = 0;
  let total = 0;
  const shots: ShotTrace[] = [];
  for (const input of c.inputs.slice(0, MAX_LEVEL_SHOTS)) {
    if (lives === 0) break;
    const round = makeLevelRound(c.seed, level);
    const p = shotParams(round, input);
    const s = startShot(round, input);
    const keeperZ0 = s.keeperZ;
    while (!s.result) stepShot(s);
    const r = s.result;
    const points = levelPoints(r.points, level);
    shots.push({
      level,
      kind: r.kind,
      points,
      viaPost: r.viaPost,
      corner: r.corner,
      ticks: s.tick,
      keeperZ0,
      keeperTarget: s.keeperTarget,
      keeperZ: s.keeperZ,
      pos: [s.pos.x, s.pos.y, s.pos.z],
      vel: [s.vel.x, s.vel.y, s.vel.z],
      touched: [s.touchedWall, s.touchedKeeper, s.touchedPost],
      params: p ? { vel: [p.vel.x, p.vel.y, p.vel.z], curve: p.curve, power: p.power, shake: p.shake, yaw: p.scatter.yaw, lift: p.scatter.lift, targetZ: p.targetZ, arrivalZ: p.arrivalZ } : null,
    });
    total += points;
    if (r.kind === 'goal') {
      cleared++;
      level++;
    } else lives--;
  }
  // Resmi skor fonksiyonuyla çapraz kontrol (aynı sonucu vermeli).
  const official = scoreLevelRun(c.seed, c.inputs);
  if (official.total !== total || official.level !== level || official.cleared !== cleared || official.lives !== lives) {
    throw new Error(`traceRun ≠ scoreLevelRun (${c.id})`);
  }
  return { id: c.id, seed: c.seed, level, cleared, lives, total, shots };
}

export function runCases(cases: RunCase[]): { simVersion: number; runs: RunTrace[] } {
  return { simVersion: SIM_VERSION, runs: cases.map(traceRun) };
}

// Tarayıcı paketi: esbuild globalName ile globalThis.__frikikSim.runCases
