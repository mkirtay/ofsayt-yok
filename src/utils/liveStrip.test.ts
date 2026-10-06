import { describe, expect, it } from 'vitest';
import type { Match } from '@/models/liveScore';
import { presetCompetitionIds } from './leagueFilter';
import { LIVE_STRIP_MAX_FINISHED, selectLiveStripMatches, stripPriority } from './liveStrip';

const SUPER_ID = [...presetCompetitionIds('super')][0]!;
const m = (id: number, over: Partial<Match> & { comp?: number; h?: number; a?: number } = {}) =>
  ({
    id,
    status: 'FINISHED',
    time: '',
    date: '2026-10-06',
    scheduled: '10:00',
    home: { id: over.h ?? 5000 + id * 2, name: `H${id}` },
    away: { id: over.a ?? 5001 + id * 2, name: `A${id}` },
    competition: { id: over.comp ?? 999001, name: 'Lig' },
    ...over,
  }) as Match;

const ALL = { mode: 'all', custom: [] } as never;
const base = { leagueFilter: ALL, todayIso: '2026-10-06', selectedDate: '2026-10-06' };
const ids = (r: ReturnType<typeof selectLiveStripMatches>) => r?.matches.map((x) => Number(x.id));

describe('canlı maç şeridi seçimi (canlı + bugün biten)', () => {
  it('önce canlılar, sonra bugün bitenler; bitmişlerde en yeni biten (en geç başlayan) başa', () => {
    const live = [m(1, { status: 'IN PLAY', scheduled: '12:00' }), m(2, { status: 'HALF TIME BREAK', scheduled: '11:00' })];
    const pool = [m(10, { scheduled: '08:00' }), m(11, { scheduled: '10:00' }), m(12, { scheduled: '09:00' })];
    const r = selectLiveStripMatches({ ...base, live, pool });
    expect(ids(r)).toEqual([2, 1, 11, 12, 10]);
    expect(r?.liveCount).toBe(2);
  });

  it('öncelik: Türk takımı / Türkiye ligi / Süper Lig / 5 Büyük Lig önde, sonra diğerleri (her grupta)', () => {
    const live = [m(1, { status: 'IN PLAY', scheduled: '09:00' }), m(2, { status: 'IN PLAY', scheduled: '12:00', comp: SUPER_ID }), m(3, { status: 'IN PLAY', scheduled: '13:00', h: 34 })];
    const pool = [m(10, { scheduled: '15:00' }), m(11, { scheduled: '08:00', country: { id: 48, name: 'Turkey' } } as Partial<Match>)];
    const r = selectLiveStripMatches({ ...base, live, pool });
    expect(ids(r)).toEqual([2, 3, 1, 11, 10]);
    expect(stripPriority(m(5))).toBe(1);
    expect(stripPriority(m(5, { a: 88 }))).toBe(0);
  });

  it('bitmişler en çok 15; canlıda olan, ertelenen, başka gün, canlı olmayan-bitmemiş (başlamadı) elenir; yinelenen tek', () => {
    const pool = [
      ...Array.from({ length: 20 }, (_, i) => m(100 + i, { scheduled: `${String(i % 24).padStart(2, '0')}:00` })),
      m(1, { status: 'FINISHED' }),
      m(200, { state_code: 'POSTPONED' }),
      m(201, { date: '2026-10-05' }),
      m(202, { status: 'NOT STARTED' }),
    ];
    const live = [m(1, { status: 'IN PLAY' })];
    const r = selectLiveStripMatches({ ...base, live, pool: pool.concat(pool.slice(0, 3)) });
    expect(ids(r)!.filter((x) => x !== 1)).toHaveLength(LIVE_STRIP_MAX_FINISHED);
    expect(ids(r)!.filter((x) => x === 1)).toHaveLength(1);
    for (const bad of [200, 201, 202]) expect(ids(r)).not.toContain(bad);
  });

  it('yalnız bugün seçiliyken; başka gün seçilince gizli (null)', () => {
    const live = [m(1, { status: 'IN PLAY' })];
    expect(selectLiveStripMatches({ ...base, selectedDate: '2026-10-07', live, pool: [m(2)] })).toBeNull();
    expect(selectLiveStripMatches({ ...base, live, pool: [m(2)] })).not.toBeNull();
  });

  it('hiç kart yoksa null (şerit tamamen gizli)', () => {
    expect(selectLiveStripMatches({ ...base, live: [], pool: [m(1, { status: 'NOT STARTED' })] })).toBeNull();
    expect(selectLiveStripMatches({ ...base, live: [], pool: [] })).toBeNull();
  });

  it('lig filtresi (Süper Lig / seçim) ve sayfa izin listesi hem canlı hem bitmişlere uygulanır', () => {
    const custom = { mode: 'custom', custom: [{ id: 600, name: 'Süper Lig' }] } as never;
    const live = [m(1, { status: 'IN PLAY', comp: 600 }), m(2, { status: 'IN PLAY', comp: 564 })];
    const pool = [m(3, { comp: 600 }), m(4, { comp: 564 })];
    expect(ids(selectLiveStripMatches({ ...base, leagueFilter: custom, live, pool }))).toEqual([1, 3]);
    expect(ids(selectLiveStripMatches({ ...base, live, pool, allowedCompetitionIds: new Set([564]) }))).toEqual([2, 4]);
    // filtre her şeyi eleyince şerit gizli
    expect(selectLiveStripMatches({ ...base, leagueFilter: { mode: 'custom', custom: [{ id: 1, name: 'x' }] } as never, live, pool })).toBeNull();
  });
});
