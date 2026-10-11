import { describe, expect, it, vi } from 'vitest';
import type { Match } from '@/models/liveScore';
import { LIVE_TICKER_MAX, selectLiveTickerMatches, tickerPriority } from './liveTicker';

const m = (id: number, over: Partial<Match> & { comp?: number; h?: number; a?: number } = {}) =>
  ({
    id,
    status: 'IN PLAY',
    time: "30'",
    date: '2026-10-06',
    scheduled: '10:00',
    home: { id: over.h ?? 5000 + id * 2, name: `H${id}` },
    away: { id: over.a ?? 5001 + id * 2, name: `A${id}` },
    competition: { id: over.comp ?? 999001, name: 'Lig' },
    ...over,
  }) as Match;

const ALL = { mode: 'all', custom: [] } as never;
const ids = (r: Match[]) => r.map((x) => Number(x.id));

describe('canlı ticker seçimi', () => {
  it('yalnız oynanan / devre arasındaki maçlar; bitmiş, başlamamış elenir; yinelenen tek', () => {
    const live = [m(1), m(2, { status: 'HALF TIME BREAK' }), m(3, { status: 'FINISHED' }), m(4, { status: 'NOT STARTED' }), m(1)];
    expect(ids(selectLiveTickerMatches({ live, leagueFilter: ALL }))).toEqual([1, 2]);
  });

  it('sıra maç listesinin lig sırası: Türk dört büyüğü, Süper Lig, 5 Büyük Lig (PL→Ligue 1), diğer 1. ligler, alt kademe; aynı kademede başlama saati', () => {
    vi.stubEnv('NEXT_PUBLIC_SPORTMONKS_ENABLED', 'true');
    const live = [
      m(1, { scheduled: '09:00', comp: 1283 }), // Türkiye 2. Lig (alt kademe)
      m(2, { scheduled: '10:30', comp: 384 }), // Serie A
      m(3, { scheduled: '10:30', comp: 600 }), // Süper Lig
      m(4, { scheduled: '11:00', comp: 2, h: 34 }), // UCL'de Türk dört büyüğü
      m(5, { scheduled: '10:00', comp: 609 }), // Ukrayna 1. ligi
      m(6, { scheduled: '11:00', comp: 8 }), // Premier League
      m(7, { scheduled: '08:00', comp: 72 }), // Eredivisie
    ];
    expect(ids(selectLiveTickerMatches({ live, leagueFilter: ALL }))).toEqual([4, 3, 6, 2, 7, 5, 1]);
    expect(tickerPriority(m(9, { a: 88 }))).toBe(0);
    vi.unstubAllEnvs();
  });

  it(`en çok ${LIVE_TICKER_MAX} maç`, () => {
    const live = Array.from({ length: LIVE_TICKER_MAX + 5 }, (_, i) => m(100 + i));
    expect(selectLiveTickerMatches({ live, leagueFilter: ALL })).toHaveLength(LIVE_TICKER_MAX);
  });

  it('canlı maç yoksa boş (ticker çizilmez)', () => {
    expect(selectLiveTickerMatches({ live: [], leagueFilter: ALL })).toEqual([]);
    expect(selectLiveTickerMatches({ live: [m(1, { status: 'FINISHED' })], leagueFilter: ALL })).toEqual([]);
  });

  it('lig filtresi (Süper Lig / seçim) ve sayfa izin listesi uygulanır', () => {
    const custom = { mode: 'custom', custom: [{ id: 600, name: 'Süper Lig' }] } as never;
    const live = [m(1, { comp: 600 }), m(2, { comp: 564 })];
    expect(ids(selectLiveTickerMatches({ live, leagueFilter: custom }))).toEqual([1]);
    expect(ids(selectLiveTickerMatches({ live, leagueFilter: ALL, allowedCompetitionIds: new Set([564]) }))).toEqual([2]);
    expect(selectLiveTickerMatches({ live, leagueFilter: { mode: 'custom', custom: [{ id: 1, name: 'x' }] } as never })).toEqual([]);
  });
});
