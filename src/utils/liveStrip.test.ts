import { describe, expect, it } from 'vitest';
import type { Match } from '@/models/liveScore';
import { LIVE_STRIP_MAX, selectLiveStripMatches } from './liveStrip';

const m = (id: number, over: Partial<Match> & { comp?: number; h?: number; a?: number } = {}) =>
  ({
    id,
    status: 'NOT STARTED',
    time: '',
    date: '2026-10-06',
    scheduled: '10:00',
    home: { id: over.h ?? 1000 + id * 2, name: `H${id}` },
    away: { id: over.a ?? 1001 + id * 2, name: `A${id}` },
    competition: { id: over.comp ?? 8, name: 'Lig' },
    ...over,
  }) as Match;

const ALL = { mode: 'all', custom: [] } as never;
const base = { leagueFilter: ALL, todayIso: '2026-10-06' };
const ids = (r: ReturnType<typeof selectLiveStripMatches>) => r?.matches.map((x) => Number(x.id));

describe('canlı maç şeridi seçimi (karışık)', () => {
  it('önce canlılar (Süper Lig önde, aynı ligde saat), ardından bugünün yaklaşanları', () => {
    const live = [m(1, { status: 'IN PLAY', comp: 564, scheduled: '09:00' }), m(2, { status: 'IN PLAY', comp: 600, scheduled: '11:00' }), m(3, { status: 'HALF TIME BREAK', comp: 600, scheduled: '10:00' })];
    const r = selectLiveStripMatches({ ...base, live, pool: [m(9, { scheduled: '18:00' }), m(8, { scheduled: '12:00' })] });
    expect(ids(r)).toEqual([3, 2, 1, 8, 9]);
    expect(r?.liveCount).toBe(3);
  });

  it('yaklaşanlar: Süper Lig önce, aynı ligde iki büyük takım önde, sonra saat', () => {
    const pool = [
      m(1, { comp: 600, scheduled: '09:00' }),
      m(2, { comp: 600, scheduled: '20:00', h: 34, a: 88 }), // GS–FB
      m(3, { comp: 600, scheduled: '12:00', h: 34 }), // yalnız bir büyük
      m(4, { comp: 564, scheduled: '08:00', h: 3468, a: 83 }), // El Clásico, daha düşük lig
      m(5, { comp: 600, scheduled: '11:00' }),
    ];
    const r = selectLiveStripMatches({ ...base, live: [], pool });
    expect(ids(r)).toEqual([2, 3, 1, 5, 4]);
    expect([...r!.bigIds].sort()).toEqual(['2', '4']); // iki büyük takım → ince işaret
  });

  it('en çok 12; canlı + yaklaşan toplamı; yinelenen / canlı olan / ertelenen / bitmiş / başka gün elenir', () => {
    const live = Array.from({ length: 3 }, (_, i) => m(i + 1, { status: 'IN PLAY' }));
    const up = Array.from({ length: 15 }, (_, i) => m(100 + i, { scheduled: `${String(10 + (i % 10)).padStart(2, '0')}:00` }));
    const pool = [...up, ...up.slice(0, 4), m(1), m(200, { state_code: 'POSTPONED' }), m(201, { date: '2026-10-09' }), m(202, { status: 'FINISHED' })];
    const r = selectLiveStripMatches({ ...base, live, pool });
    expect(r!.matches).toHaveLength(LIVE_STRIP_MAX);
    expect(new Set(ids(r)).size).toBe(LIVE_STRIP_MAX);
    for (const bad of [200, 201, 202]) expect(ids(r)).not.toContain(bad);
  });

  it('bugünden az kaldıysa (< 6) yarının maçları eklenir; yeterliyse eklenmez', () => {
    const tomorrow = [m(50, { date: '2026-10-07', scheduled: '09:00' }), m(51, { date: '2026-10-07', scheduled: '10:00' })];
    expect(ids(selectLiveStripMatches({ ...base, live: [], pool: [m(1), ...tomorrow] }))).toEqual([1, 50, 51]);
    const many = Array.from({ length: 6 }, (_, i) => m(10 + i));
    expect(ids(selectLiveStripMatches({ ...base, live: [], pool: [...many, ...tomorrow] }))).toEqual([10, 11, 12, 13, 14, 15]);
  });

  it('hiçbiri yoksa null (şerit gizli)', () => {
    expect(selectLiveStripMatches({ ...base, live: [], pool: [m(1, { status: 'FINISHED' })] })).toBeNull();
  });

  it('lig filtresi ve sayfa izin listesi uygulanır', () => {
    const custom = { mode: 'custom', custom: [{ id: 600, name: 'Süper Lig' }] } as never;
    const live = [m(1, { status: 'IN PLAY', comp: 600 }), m(2, { status: 'IN PLAY', comp: 564 })];
    expect(ids(selectLiveStripMatches({ ...base, leagueFilter: custom, live, pool: [m(3, { comp: 564 })] }))).toEqual([1]);
    expect(ids(selectLiveStripMatches({ ...base, live, pool: [], allowedCompetitionIds: new Set([564]) }))).toEqual([2]);
  });
});
