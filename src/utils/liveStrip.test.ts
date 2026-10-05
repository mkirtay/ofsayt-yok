import { describe, expect, it } from 'vitest';
import type { Match } from '@/models/liveScore';
import { LIVE_STRIP_MAX_UPCOMING, selectLiveStripMatches } from './liveStrip';

const m = (id: number, over: Partial<Match> & { comp?: number } = {}) =>
  ({
    id,
    status: 'NOT STARTED',
    time: '',
    date: '2026-10-06',
    scheduled: '10:00',
    home: { id: id * 2, name: `H${id}` },
    away: { id: id * 2 + 1, name: `A${id}` },
    competition: { id: over.comp ?? 8, name: 'Lig' },
    ...over,
  }) as Match;

const ALL = { mode: 'all', custom: [] } as never;
const base = { leagueFilter: ALL, todayIso: '2026-10-06' };
const ids = (r: ReturnType<typeof selectLiveStripMatches>) => r?.matches.map((x) => Number(x.id));

describe('canlı maç şeridi seçimi', () => {
  it('canlı varsa yalnız canlılar; önce Süper Lig, sonra aynı ligde başlama saati', () => {
    const live = [m(1, { status: 'IN PLAY', comp: 564, scheduled: '09:00' }), m(2, { status: 'IN PLAY', comp: 600, scheduled: '11:00' }), m(3, { status: 'HALF TIME BREAK', comp: 600, scheduled: '10:00' })];
    const r = selectLiveStripMatches({ ...base, live, pool: [m(9)] });
    expect(r?.kind).toBe('live');
    expect(ids(r)).toEqual([3, 2, 1]);
  });

  it('canlı yoksa bugünün başlamamış maçları (saat sırası, en çok 12); ertelenen / başka gün / bitmiş yok', () => {
    const pool = [
      ...Array.from({ length: 15 }, (_, i) => m(100 + i, { scheduled: `${String(10 + (i % 10)).padStart(2, '0')}:00` })),
      m(200, { state_code: 'POSTPONED' }),
      m(201, { date: '2026-10-07' }),
      m(202, { status: 'FINISHED' }),
    ];
    const r = selectLiveStripMatches({ ...base, live: [], pool: pool.concat(pool.slice(0, 3)) });
    expect(r?.kind).toBe('upcoming');
    expect(r!.matches).toHaveLength(LIVE_STRIP_MAX_UPCOMING);
    expect(new Set(ids(r)).size).toBe(LIVE_STRIP_MAX_UPCOMING);
    expect(ids(r)).not.toContain(200);
    expect(ids(r)).not.toContain(201);
    expect(ids(r)).not.toContain(202);
  });

  it('hiçbiri yoksa null (şerit gizli)', () => {
    expect(selectLiveStripMatches({ ...base, live: [], pool: [m(1, { status: 'FINISHED' })] })).toBeNull();
  });

  it('lig filtresi ve sayfa izin listesi uygulanır', () => {
    const live = [m(1, { status: 'IN PLAY', comp: 600 }), m(2, { status: 'IN PLAY', comp: 564 })];
    expect(ids(selectLiveStripMatches({ ...base, leagueFilter: { mode: 'custom', custom: [{ id: 600, name: 'Süper Lig' }] } as never, live, pool: [] }))).toEqual([1]);
    expect(ids(selectLiveStripMatches({ ...base, live, pool: [], allowedCompetitionIds: new Set([564]) }))).toEqual([2]);
    // süzülünce canlı kalmazsa bugünün maçlarına düşer
    const r = selectLiveStripMatches({ ...base, leagueFilter: { mode: 'custom', custom: [{ id: 600, name: 'Süper Lig' }] } as never, live: [m(2, { status: 'IN PLAY', comp: 564 })], pool: [m(3, { comp: 600 })] });
    expect(r?.kind).toBe('upcoming');
  });
});
