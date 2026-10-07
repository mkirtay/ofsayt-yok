import { describe, expect, it } from 'vitest';
import { GOAL, KEEPER_TIERS } from '@/lib/frikik/sim';
import { GOAL_SHORT, keeperPoseAt, mixPose, planKeeperMove, READY_POSE, REACT_TICKS } from './keeperMove';

const base = (over: Partial<Parameters<typeof planKeeperMove>[0]> = {}) =>
  planKeeperMove({ z0: -0.7, target: 3.1, speed: KEEPER_TIERS[2]!.speed, crossed: true, ballZ: 3.2, tCross: 106, saved: false, halfW: GOAL.halfW, ...over });

describe('kaleci hamlesi (görsel plan)', () => {
  it('köşe şutunda kök yan eksende (z) hedefe doğru ≥ 2,5 m ilerler, monoton, inişten sonra sabit; sağ ve sol simetrik', () => {
    for (const sign of [1, -1] as const) {
      const k = base({ z0: -0.7 * sign, target: 3.1 * sign, ballZ: 3.2 * sign });
      expect(k.dive).toBe(true);
      expect(k.dir).toBe(sign);
      // Gol: eller topa GOAL_SHORT kala; kurtarış: eller topun yolunda
      expect(k.handsZ).toBeCloseTo(3.2 * sign - sign * GOAL_SHORT, 9);
      expect(base({ z0: -0.7 * sign, target: 3.1 * sign, ballZ: 3.2 * sign, saved: true }).handsZ).toBeCloseTo(3.2 * sign, 9);
      const total = Math.abs(k.rootEnd - k.z0);
      expect(total, `kök yer değiştirme ${total}`).toBeGreaterThanOrEqual(2.5);
      // Parmak uçları kökün ötesinde, direğin içinde
      expect(sign * k.handsZ).toBeGreaterThan(sign * k.rootEnd);
      expect(Math.abs(k.handsZ)).toBeLessThanOrEqual(GOAL.halfW - 0.1);
      expect(Math.abs(k.rootEnd)).toBeLessThanOrEqual(GOAL.halfW - 0.45);
      let prev = k.z0;
      let peak = 0;
      let peakTick = 0;
      for (let t = 0; t <= k.diveStart + k.diveDur + 40; t++) {
        const p = keeperPoseAt(k, t);
        expect(sign * (p.root - prev), `tick ${t}`).toBeGreaterThanOrEqual(-1e-9); // monoton
        expect(p.lift).toBeGreaterThanOrEqual(0);
        if (p.lift > peak) {
          peak = p.lift;
          peakTick = t;
        }
        prev = p.root;
      }
      expect(prev).toBeCloseTo(k.rootEnd, 9);
      // Ayaklar yerden kopar; tepe dalış süresinin ortasında
      expect(peak).toBeGreaterThan(0.4);
      expect(Math.abs(peakTick - (k.diveStart + k.diveDur / 2))).toBeLessThanOrEqual(2);
      // Vuruştan önce ve tepki süresinde yerinde
      expect(keeperPoseAt(k, 0).root).toBe(k.z0);
      expect(keeperPoseAt(k, REACT_TICKS - 1).root).toBe(k.z0);
      // İnişten sonra yerde ve sabit
      const after = keeperPoseAt(k, k.diveStart + k.diveDur + 30);
      expect(after.lift).toBe(0);
      expect(after.root).toBeCloseTo(k.rootEnd, 9);
      expect(after.tilt).toBeCloseTo(k.tilt, 9);
    }
  });

  it('merkeze yakın şutta ya da top kaleciye gelmiyorsa dalış yok: küçük adım + çömelme, ayaklar yerde', () => {
    expect(base({ crossed: false, tCross: 60 }).dive).toBe(false);
    const k = base({ z0: 0.2, target: 0.6, ballZ: 0.7, saved: true });
    expect(k.dive).toBe(false);
    for (let t = 0; t < 120; t++) expect(keeperPoseAt(k, t).lift).toBe(0);
    const end = keeperPoseAt(k, 119);
    expect(Math.abs(end.root - k.z0)).toBeLessThan(0.9);
    expect(end.crouch).toBeGreaterThan(0.7);
    expect(end.reach).toBe(1);
  });

  it('dalış süresi 0,25–0,4 sn, topun geçişinde biter; hızlı kaleci daha seri', () => {
    const slow = base({ speed: KEEPER_TIERS[0]!.speed });
    const fast = base({ speed: KEEPER_TIERS[4]!.speed });
    for (const k of [slow, fast]) {
      expect(k.diveDur).toBeGreaterThanOrEqual(30);
      expect(k.diveDur).toBeLessThanOrEqual(48);
      expect(k.diveStart + k.diveDur).toBe(106 - 2);
    }
    expect(fast.diveDur).toBeLessThan(slow.diveDur);
    // Top çok erken geçerse dalış yine hazırlık adımından sonra başlar ve en kısa süresini korur
    const early = base({ tCross: 20 });
    expect(early.diveStart).toBe(REACT_TICKS + 12);
    expect(early.diveDur).toBeGreaterThanOrEqual(30);
  });

  it('toparlanma: poz karışımı uçlarda tam değerler', () => {
    const k = base();
    const end = keeperPoseAt(k, 400);
    expect(mixPose(end, READY_POSE, 0)).toEqual(end);
    expect(mixPose(end, READY_POSE, 1)).toEqual(READY_POSE);
    expect(mixPose(end, READY_POSE, 0.5).root).toBeCloseTo((end.root + READY_POSE.root) / 2, 9);
  });
});
