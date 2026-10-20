import { describe, expect, it } from 'vitest';
import type { Match } from '@/models/liveScore';
import { candidatesIn, pickDaily, rankWeekly, selectMatches, turkishTeamsIn } from './selection';
import { WEEKLY_LIMITS } from '@/config/gameMatchPriority';

const NOW = new Date('2026-10-19T06:00:00Z');
const START = new Date('2026-10-18T21:00:00Z');
const END = new Date('2026-10-25T21:00:00Z');

// Takım id'leri: GS 34, FB 88, BJK 554, TS 688 · devler RM 3468, BAR 83, BAY 503, PSG 591, LIV 8, ARS 19, MCI 9, INT 2930 · ek: BVB 68
let seq = 0;
const m = (date: string, league: number, homeId: number, awayId: number, hhmm = '19:00', over: Partial<Match> = {}): Match =>
  ({ id: ++seq, date, scheduled: hhmm, status: 'NOT STARTED', competition_id: league, home: { id: homeId, name: `T${homeId}` }, away: { id: awayId, name: `T${awayId}` }, ...over }) as Match;
const ids = (xs: { home: string; away: string }[]) => xs.map((x) => `${x.home}-${x.away}`);

describe('maç önceliği (config/gameMatchPriority.ts)', () => {
  it("Türkiye'nin büyüklerinin her maçı (Süper Lig + Avrupa) her zaman girer; sınırlara takılmaz", () => {
    const list = [
      m('2026-10-21', 2, 690, 34), // Lille – GS (UCL)
      m('2026-10-24', 600, 34, 7000), // GS Süper Lig
      m('2026-10-20', 2, 88, 216), // FB – Slavia
      m('2026-10-22', 2286, 688, 314), // TS – Hearts
      m('2026-10-22', 5, 554, 51), // BJK – Palace
      // 12 dev maçı UCL'de (lig sınırı 5) + sıradan Premier Lig maçları
      ...Array.from({ length: 12 }, (_, i) => m('2026-10-20', 2, [3468, 83, 503, 591, 8, 19][i % 6]!, 9000 + i)),
      ...Array.from({ length: 4 }, (_, i) => m('2026-10-24', 8, 9500 + i, 9600 + i)),
    ];
    const picked = selectMatches(candidatesIn(list, START, END, NOW), 10, WEEKLY_LIMITS);
    const names = ids(picked);
    for (const must of ['T690-T34', 'T34-T7000', 'T88-T216', 'T688-T314', 'T554-T51']) expect(names).toContain(must);
    expect(picked).toHaveLength(10);
    // UCL toplam en çok 5 (2'si dört büyük) → 3 dev maçı; kalan 2 yer Premier Lig'den.
    expect(picked.filter((c) => c.leagueId === 2)).toHaveLength(5);
    expect(picked.filter((c) => c.leagueId === 8)).toHaveLength(2);
  });

  it('Avrupa kupasındaki diğer Türk takımı (haftanın Türkiye ligi fikstüründen tanınır) devlerden önce', () => {
    const list = [m('2026-10-24', 600, 2811, 3570), m('2026-10-23', 2286, 2811, 400), m('2026-10-21', 2, 8, 401)];
    expect(turkishTeamsIn(list).has(2811)).toBe(true);
    const r = rankWeekly(candidatesIn(list, START, END, NOW), 10);
    expect(ids(r).slice(0, 2)).toEqual(['T2811-T400', 'T8-T401']); // Samsunspor (Avrupa) → Liverpool; Süper Lig maçı sonra
  });

  it('iki dev karşılaşıyorsa en üstte; çekirdek dev ek listeden önce; sonra Süper Lig / büyük 5; diğerleri en sonda', () => {
    const list = [m('2026-10-20', 8, 68, 500), m('2026-10-25', 564, 83, 3468, '20:00'), m('2026-10-21', 8, 9, 501), m('2026-10-24', 600, 600, 601), m('2026-10-24', 72, 700, 701)];
    expect(ids(rankWeekly(candidatesIn(list, START, END, NOW), 10))).toEqual(['T83-T3468', 'T9-T501', 'T68-T500', 'T600-T601', 'T700-T701']);
  });

  it('aday çeşitliliği yoksa liste sınırlar aşılarak 10\'a tamamlanır (yayın için tam liste)', () => {
    const list = Array.from({ length: 12 }, (_, i) => m('2026-10-20', 2, 3000 + i, 3100 + i));
    expect(selectMatches(candidatesIn(list, START, END, NOW), 10, WEEKLY_LIMITS)).toHaveLength(10);
  });

  it('çeşitlilik: aynı takımdan en çok 2 maç, aynı ligden en çok 5', () => {
    const list = [
      ...[0, 1, 2].map((i) => m(`2026-10-2${i}`, [2, 8, 570][i]!, 3468, 800 + i)), // Real Madrid 3 maç
      ...Array.from({ length: 8 }, (_, i) => m('2026-10-24', 8, 900 + i, 950 + i)), // PL 8 sıradan maç
      ...Array.from({ length: 6 }, (_, i) => m('2026-10-25', 564, 1000 + i, 1050 + i)),
    ];
    const picked = selectMatches(candidatesIn(list, START, END, NOW), 10, WEEKLY_LIMITS);
    expect(picked.filter((c) => c.homeId === 3468)).toHaveLength(2);
    expect(picked.filter((c) => c.leagueId === 8).length).toBeLessThanOrEqual(5);
    // Admin listesi: otomatik 10 önce işaretli, kalanlar arkada.
    const r = rankWeekly(candidatesIn(list, START, END, NOW), 10);
    expect(r.filter((x) => x.auto).length).toBe(picked.length);
    expect(r.slice(0, picked.length).every((x) => x.auto)).toBe(true);
  });

  it('günün 3 maçı: dört büyüklerden biri oynuyorsa mutlaka seçilir; aynı ligden en çok 2', () => {
    const day = [m('2026-10-19', 8, 9, 10, '19:00'), m('2026-10-19', 8, 8, 11, '20:00'), m('2026-10-19', 8, 19, 12, '21:00'), m('2026-10-19', 600, 688, 554, '17:00')];
    const p = pickDaily(candidatesIn(day, START, END, NOW));
    expect(ids(p)[0]).toBe('T688-T554');
    expect(p).toHaveLength(3);
    expect(p.filter((c) => c.leagueId === 8)).toHaveLength(2);
  });

  it('başlamış, saati belirsiz, durum kodlu ya da pencere dışı maç aday değil', () => {
    const list = [m('2026-10-19', 600, 34, 1, '05:00'), m('2026-10-20', 600, 34, 2, '12:00', { time_tbd: true }), m('2026-10-20', 600, 34, 3, '12:00', { state_code: 'POSTPONED' }), m('2026-10-26', 600, 34, 4)];
    expect(candidatesIn(list, START, END, NOW)).toEqual([]);
    expect(pickDaily([])).toEqual([]);
  });

  it('boş yer doldurma: mevcut maçlar toplama ve sınırlara sayılır, yalnız yeniler döner', () => {
    const list = Array.from({ length: 6 }, (_, i) => m('2026-10-24', 8, 4000 + i, 4100 + i));
    const existing = Array.from({ length: 8 }, (_, i) => ({ leagueId: i < 4 ? 8 : 600, homeId: 5000 + i, awayId: 5100 + i }));
    const add = selectMatches(candidatesIn(list, START, END, NOW), 10, WEEKLY_LIMITS, existing);
    expect(add).toHaveLength(2); // 10 − 8
    expect(selectMatches(candidatesIn(list, START, END, NOW), 10, WEEKLY_LIMITS, Array.from({ length: 10 }, () => ({ leagueId: 1, homeId: 1, awayId: 2 })))).toEqual([]);
  });
});
