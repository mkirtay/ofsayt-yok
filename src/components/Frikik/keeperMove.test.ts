import { describe, expect, it } from 'vitest';
import { GOAL, KEEPER, KEEPER_TIERS, BALL_R } from '@/lib/frikik/sim';
import { contactTick, GOAL_SHORT, keeperHandsAt, keeperPoseAt, mixPose, planKeeperMove, READY_POSE, REACT_TICKS } from './keeperMove';

const base = (over: Partial<Parameters<typeof planKeeperMove>[0]> = {}) =>
  planKeeperMove({ z0: -0.7, target: 3.1, speed: KEEPER_TIERS[2]!.speed, crossed: true, ballZ: 3.2, ballY: 1.0, tCross: 106, saved: false, halfW: GOAL.halfW, ...over });

describe('kaleci hamlesi (görsel plan)', () => {
  it('köşe şutunda kök yan eksende (z) hedefe doğru ≥ 2,5 m ilerler, monoton, temas anında hedefte, inişten sonra sabit; sağ/sol simetrik', () => {
    for (const sign of [1, -1] as const) {
      const k = base({ z0: -0.7 * sign, target: 3.1 * sign, ballZ: 3.2 * sign, saved: true });
      expect(k.dive).toBe(true);
      expect(k.dir).toBe(sign);
      const total = Math.abs(k.rootEnd - k.z0);
      expect(total, `kök yer değiştirme ${total}`).toBeGreaterThanOrEqual(2.5);
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
      expect(Math.abs(keeperPoseAt(k, contactTick(k)).root - k.rootEnd)).toBeLessThan(0.05); // tick yuvarlaması
      // Ayaklar yerden kopar; tepe dalış süresinin ortasında
      expect(peak).toBeGreaterThan(0.05);
      expect(Math.abs(peakTick - (k.diveStart + k.diveDur / 2))).toBeLessThanOrEqual(2);
      expect(keeperPoseAt(k, 0).root).toBe(k.z0);
      expect(keeperPoseAt(k, REACT_TICKS - 1).root).toBe(k.z0);
      const after = keeperPoseAt(k, k.diveStart + k.diveDur + 30);
      expect(after.lift).toBe(0);
      expect(after.root).toBeCloseTo(k.rootEnd, 9);
      expect(after.tilt).toBeCloseTo(k.tilt, 9);
    }
  });

  it('eller–top: kurtarışta temas anında eller topun (y, z) konumunda (< 0,12 m); golde ≥ 0,3 m uzakta — alçak, orta ve yüksek köşe', () => {
    for (const ballY of [0.4, 1.0, 1.7, 2.1]) {
      for (const sign of [1, -1] as const) {
        for (const saved of [true, false]) {
          const k = base({ z0: -0.5 * sign, target: 3 * sign, ballZ: 3.1 * sign, ballY, saved });
          const h = keeperHandsAt(k, contactTick(k));
          const d = Math.hypot(h.y - ballY, h.z - 3.1 * sign);
          if (saved) expect(d, `kurtarış y=${ballY} s=${sign}: ${d}`).toBeLessThan(0.12);
          else {
            expect(d, `gol y=${ballY} s=${sign}: ${d}`).toBeGreaterThanOrEqual(0.3);
            expect(d).toBeLessThanOrEqual(GOAL_SHORT + 0.15);
          }
          // Eller sim silindirinin yüksekliğini aşmaz (kurtarış silindir içinde kalır), kale içinde
          expect(h.y).toBeLessThanOrEqual(KEEPER.height + BALL_R + 0.3);
          expect(Math.abs(h.z)).toBeLessThanOrEqual(GOAL.halfW);
          // Yüksek topta sıçrama + dik gövde, alçak topta yere yakın yatış
          if (ballY >= 1.7) expect(k.jump).toBeGreaterThan(0.2);
          if (ballY <= 0.4) expect(k.tilt).toBeGreaterThan(1.0);
        }
      }
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

  it('dalış süresi 0,25–0,5 sn, temas topun geçişinde; hızlı kaleci daha seri', () => {
    const slow = base({ speed: KEEPER_TIERS[0]!.speed });
    const fast = base({ speed: KEEPER_TIERS[4]!.speed });
    for (const k of [slow, fast]) {
      expect(k.diveDur).toBeGreaterThanOrEqual(30);
      expect(k.diveDur).toBeLessThanOrEqual(60);
      expect(Math.abs(contactTick(k) - 105)).toBeLessThanOrEqual(1);
    }
    expect(fast.diveDur).toBeLessThan(slow.diveDur);
    const early = base({ tCross: 20 });
    expect(early.diveStart).toBe(REACT_TICKS + 12);
    expect(early.diveDur).toBeGreaterThanOrEqual(30);
  });

  it('lob: kaleci topu baraj geçilince görür (tSeen) → tepki gecikir, dalış yine temasta biter; eller topta', () => {
    const k = base({ ballY: 1.5, ballZ: 1.4, z0: -0.6, target: 1.3, saved: true, tCross: 150, tSeen: 90 });
    expect(k.react).toBe(86);
    for (let t = 0; t < 86; t++) expect(keeperPoseAt(k, t).root).toBe(k.z0);
    expect(contactTick(k)).toBeLessThanOrEqual(150);
    const h = keeperHandsAt(k, contactTick(k));
    expect(Math.hypot(h.y - 1.5, h.z - 1.4)).toBeLessThan(0.12);
    expect(base({ tSeen: 5 }).react).toBe(REACT_TICKS);
  });

  it('toparlanma: poz karışımı uçlarda tam değerler', () => {
    const k = base();
    const end = keeperPoseAt(k, 400);
    expect(mixPose(end, READY_POSE, 0)).toEqual(end);
    expect(mixPose(end, READY_POSE, 1)).toEqual(READY_POSE);
    expect(mixPose(end, READY_POSE, 0.5).root).toBeCloseTo((end.root + READY_POSE.root) / 2, 9);
  });
});
