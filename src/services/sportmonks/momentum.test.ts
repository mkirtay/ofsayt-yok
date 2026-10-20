import { describe, expect, it } from 'vitest';
import fixture from './__fixtures__/momentumSuperLig.json';
import { computeMomentum, MOMENTUM_TREND_TYPES, type PeriodRow, type TrendRow } from './momentum';

const HOME = 286; // Gençlerbirliği
const AWAY = 34; // Galatasaray
const { DANGEROUS_ATTACKS: DA, SHOTS_TOTAL: SHOTS, CORNERS } = MOMENTUM_TREND_TYPES;

const H1: PeriodRow = { id: 1, type_id: 1, sort_order: 1, counts_from: 0, period_length: 45, minutes: 46, ended: 1 };
const H2_LIVE: PeriodRow = { id: 2, type_id: 2, sort_order: 2, counts_from: 45, period_length: 45, minutes: 60, ended: null };
const row = (team: number, type: number, minute: number, value: number, period = 1): TrendRow => ({
  participant_id: team,
  type_id: type,
  minute,
  value,
  period_id: period,
});

describe('computeMomentum', () => {
  it('gerçek SL maçı: iki devre, ~98 nokta, −100…100, deplasman (GS) baskısı ağır basar', () => {
    const d = fixture.data;
    const m = computeMomentum({ trends: d.trends, periods: d.periods, homeId: HOME, awayId: AWAY })!;
    expect(m.segments).toEqual([
      // 0. dakika (başlama) + 1–46 (45+1); 2. devre 45–95.
      { from: 0, length: 47, start: 0, played: 47 },
      { from: 45, length: 51, start: 47, played: 51 },
    ]);
    expect(m.points).toHaveLength(98);
    expect(Math.max(...m.points.map(Math.abs))).toBe(100);
    expect(m.points.every((p) => Number.isInteger(p) && p >= -100 && p <= 100)).toBe(true);
    const sum = m.points.reduce((a, b) => a + b, 0);
    expect(sum).toBeLessThan(0);
    // İstemciye giden yük küçük (ham yanıt 12 KB).
    expect(JSON.stringify(m).length).toBeLessThan(600);
  });

  it('kümülatif değerden artış alır: aynı değer tekrar sayılmaz, çoklu artış ağırlıkla çarpılır', () => {
    const trends = [
      row(HOME, DA, 10, 1),
      row(HOME, DA, 10, 1), // tekrar satırı → 0
      row(HOME, CORNERS, 20, 3), // 0→3 tek satırda → 3
      row(AWAY, SHOTS, 30, 1), // ×3
      row(AWAY, DA, 30, 2),
      row(HOME, DA, 40, 2),
    ];
    const m = computeMomentum({ trends, periods: [H1], homeId: HOME, awayId: AWAY })!;
    // 20' ev (3) ve 30' deplasman (3 + 2 = 5); sessiz maç tabanı (MIN_SCALE) yüzünden tam boya çıkmaz.
    expect(m.points[20]!).toBeGreaterThan(0);
    expect(m.points[30]!).toBeLessThan(-m.points[20]!);
    expect(m.points[30]!).toBeGreaterThan(-100);
    expect(m.points[0]).toBe(0);
  });

  it('canlı maç: süren devrede yalnız oynanan dakikalar, eksen planlanan uzunlukta', () => {
    const trends = [
      row(HOME, DA, 5, 1),
      row(HOME, DA, 12, 2),
      row(AWAY, DA, 30, 1),
      row(AWAY, SHOTS, 44, 1),
      row(HOME, DA, 50, 3, 2),
      row(AWAY, DA, 58, 2, 2),
    ];
    const m = computeMomentum({ trends, periods: [H1, H2_LIVE], homeId: HOME, awayId: AWAY })!;
    expect(m.segments[1]).toEqual({ from: 45, length: 45, start: 46, played: 14 });
    expect(m.points).toHaveLength(46 + 14);
  });

  it('veri yoksa null: boş trends, bilinmeyen takım, devre yok, sessiz maç', () => {
    expect(computeMomentum({ trends: [], periods: [H1], homeId: HOME, awayId: AWAY })).toBeNull();
    expect(computeMomentum({ trends: null, periods: [H1], homeId: HOME, awayId: AWAY })).toBeNull();
    const six = [1, 2, 3, 4, 5, 6].map((v) => row(HOME, DA, v * 5, v));
    expect(computeMomentum({ trends: six, periods: [], homeId: HOME, awayId: AWAY })).toBeNull();
    expect(computeMomentum({ trends: six, periods: [H1], homeId: null, awayId: AWAY })).toBeNull();
    const other = six.map((r) => ({ ...r, participant_id: 999 }));
    expect(computeMomentum({ trends: other, periods: [H1], homeId: HOME, awayId: AWAY })).toBeNull();
    // Penaltı devresi (type 5) eksene girmez.
    expect(computeMomentum({ trends: six, periods: [{ ...H1, type_id: 5 }], homeId: HOME, awayId: AWAY })).toBeNull();
  });

  it('dakika ofseti: 2. devre counts_from 45 → ilk nokta 2. devre başı', () => {
    const trends = [1, 2, 3, 4, 5, 6].map((v) => row(AWAY, DA, 45 + v, v, 2));
    const m = computeMomentum({ trends, periods: [H1, { ...H2_LIVE, minutes: 51 }], homeId: HOME, awayId: AWAY })!;
    expect(m.segments[0]!.played).toBe(46);
    expect(m.points.slice(0, 46).every((p) => p === 0)).toBe(true);
    expect(m.points.slice(46).some((p) => p < 0)).toBe(true);
  });
});
