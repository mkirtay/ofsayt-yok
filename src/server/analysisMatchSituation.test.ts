import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Match } from '@/models/liveScore';
import type { RecentMatchRow } from '@/server/buildMatchAnalysisContext';
import type { CompetitionTableData } from '@/services/liveScoreService';

vi.mock('@/services/liveScoreService', () => ({ getTeamUpcomingFixtures: vi.fn() }));
vi.mock('@/services/firstLeg', () => ({ getFirstLeg: vi.fn() }));
vi.mock('@/server/teamRivals', () => ({ loadIsDerby: vi.fn() }));

const {
  notableWeather,
  lastMatchBefore,
  computeStreak,
  nextMatchAfter,
  leagueSituation,
  buildMatchSituation,
  fetchSituationExtras,
} = await import('./analysisMatchSituation');
const { getTeamUpcomingFixtures } = await import('@/services/liveScoreService');
const { getFirstLeg } = await import('@/services/firstLeg');
const { loadIsDerby } = await import('@/server/teamRivals');

const row = (date: string, result: RecentMatchRow['result'], extra: Partial<RecentMatchRow> = {}): RecentMatchRow => ({
  date,
  opponent: 'X',
  isHome: true,
  goalsFor: 1,
  goalsAgainst: 0,
  result,
  scoreText: '1-0',
  ...extra,
});

describe('notableWeather', () => {
  it('normal hava → null, uç koşullar → dolu', () => {
    expect(notableWeather(undefined)).toBeNull();
    expect(notableWeather({ tempC: 15, condition: 'cloudy', windMs: 3 })).toBeNull();
    expect(notableWeather({ tempC: 15, condition: 'rain' })).toEqual({ tempC: 15, condition: 'rain' });
    expect(notableWeather({ tempC: 15, condition: 'clear', windMs: 9.1 })).not.toBeNull();
    expect(notableWeather({ tempC: 1 })).not.toBeNull();
    expect(notableWeather({ tempC: 31, condition: 'clear' })).not.toBeNull();
  });
});

describe('lastMatchBefore / computeStreak', () => {
  // yeni → eski; ilk satır bu maçın kendisi (aynı gün) ya da oynanmamış olabilir
  const rows = [
    row('2026-11-08', 'W'),
    row('2026-11-06', 'U'),
    row('2026-11-05', 'W', { opponent: 'Lazio', isHome: false, competition: 'UEFA Europa League' }),
    row('2026-11-01', 'D'),
    row('2026-10-25', 'W'),
    row('2026-10-18', 'W'),
    row('2026-10-11', 'L'),
  ];

  it('maç günü ve oynanmamış satır atlanır; gün farkı ve turnuva', () => {
    expect(lastMatchBefore(rows, '2026-11-08')).toEqual({
      daysBefore: 3,
      opponent: 'Lazio',
      isHome: false,
      competition: 'UEFA Europa League',
    });
    expect(lastMatchBefore(rows, undefined)).toBeNull();
    expect(lastMatchBefore([], '2026-11-08')).toBeNull();
  });

  it('yenilmezlik serisi (galibiyet serisi kısa kaldığında)', () => {
    expect(computeStreak(rows, '2026-11-08')).toEqual({ kind: 'unbeaten', count: 4, atLeast: false });
  });

  it('üst üste galibiyet; tüm satırlar seri ise "en az"', () => {
    const wins = [row('2026-11-01', 'W'), row('2026-10-25', 'W'), row('2026-10-18', 'W')];
    expect(computeStreak(wins, '2026-11-08')).toEqual({ kind: 'wins', count: 3, atLeast: true });
  });

  it('kısa ya da karışık seri → null', () => {
    expect(computeStreak([row('2026-11-01', 'W'), row('2026-10-25', 'L')], '2026-11-08')).toBeNull();
  });

  it('galibiyetsizlik serisi', () => {
    const winless = ['D', 'L', 'D', 'L', 'W'].map((r, i) => row(`2026-10-${String(30 - i * 5).padStart(2, '0')}`, r as RecentMatchRow['result']));
    expect(computeStreak(winless, '2026-11-08')).toEqual({ kind: 'winless', count: 4, atLeast: false });
  });
});

describe('nextMatchAfter', () => {
  const match = { id: 10, date: '2026-11-08' } as Match;
  const upcoming = [
    { id: 10, date: '2026-11-08', home: { id: 1, name: 'A' }, away: { id: 2, name: 'B' } },
    { id: 11, date: '2026-11-11', home: { id: 3, name: 'Benfica' }, away: { id: 1, name: 'A' }, competition: { name: 'UEFA Champions League' } },
    { id: 12, date: '2026-11-15', home: { id: 1, name: 'A' }, away: { id: 4, name: 'C' } },
  ] as Match[];

  it('bu maçı atlar, sonraki ilk maç', () => {
    expect(nextMatchAfter(upcoming, match, 1)).toEqual({
      daysAfter: 3,
      opponent: 'Benfica',
      isHome: false,
      competition: 'UEFA Champions League',
    });
    expect(nextMatchAfter([], match, 1)).toBeNull();
  });
});

describe('leagueSituation', () => {
  const originalFlag = process.env.NEXT_PUBLIC_SPORTMONKS_ENABLED;
  afterEach(() => {
    if (originalFlag === undefined) delete process.env.NEXT_PUBLIC_SPORTMONKS_ENABLED;
    else process.env.NEXT_PUBLIC_SPORTMONKS_ENABLED = originalFlag;
  });
  // Puanlar 40, 38, 36 … (2'şer azalır); Süper Lig (Sportmonks 600) son 3 küme düşer.
  const table = (n: number, id = 600): CompetitionTableData => ({
    competition: { id, name: 'Lig' },
    table: Array.from({ length: n }, (_, i) => ({
      rank: i + 1,
      points: 40 - i * 2,
      matches: 12,
      goal_diff: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      team: { id: i + 1, name: `T${i + 1}` },
    })),
  });

  it('Süper Lig: lidere fark, son 3 küme hattına fark ve kalan maç', () => {
    process.env.NEXT_PUBLIC_SPORTMONKS_ENABLED = 'true';
    // 5. sıra 32 puan; ilk düşen sıra 16. → 10 puan
    expect(leagueSituation(table(18), 5)).toEqual({ rank: 5, teams: 18, pointsToLeader: 8, pointsAboveRelegation: 22, remaining: 22 });
    // 15. sıra (son güvenli) 12 puan, 16. sıra 10 puan
    expect(leagueSituation(table(18), 15)!.pointsAboveRelegation).toBe(2);
    // 16. sıra düşme hattında: son güvenli sıraya (12) 2 puan geride
    expect(leagueSituation(table(18), 16)!.pointsAboveRelegation).toBe(-2);
  });

  it('kuralı tanımsız ligde küme farkı verilmez (varsayılan "son 5" çoğu ligde yanlış)', () => {
    process.env.NEXT_PUBLIC_SPORTMONKS_ENABLED = 'true';
    const res = leagueSituation(table(20, 564), 5)!;
    expect(res.pointsAboveRelegation).toBeUndefined();
    expect(res.pointsToLeader).toBe(8);
  });

  it('tablo yok, takım yok ya da çok gruplu tablo → null', () => {
    expect(leagueSituation(null, 1)).toBeNull();
    expect(leagueSituation(table(18), 99)).toBeNull();
    const grouped: CompetitionTableData = {
      stages: [{ groups: [{ standings: table(4).table }, { standings: table(4).table }] }],
    };
    expect(leagueSituation(grouped, 1)).toBeNull();
  });
});

describe('fetchSituationExtras / buildMatchSituation', () => {
  it('hatalar sessizce düşer; 1. ayak yalnız 2/2 ve toplam skor yokken istenir', async () => {
    vi.mocked(loadIsDerby).mockResolvedValue(false);
    vi.mocked(loadIsDerby).mockRejectedValueOnce(new Error('x'));
    vi.mocked(getTeamUpcomingFixtures).mockRejectedValue(new Error('429'));
    vi.mocked(getFirstLeg).mockResolvedValueOnce({
      id: 5,
      home: { id: 2, name: 'B' },
      away: { id: 1, name: 'A' },
      scores: { ft_score: '2-1' },
    } as Match);
    const match = { id: 10, date: '2026-11-08', leg: '2/2', stage: 'Quarter-finals', weather: { tempC: 12, condition: 'rain' } } as Match;
    const extras = await fetchSituationExtras(match, 1, 2);
    expect(extras).toMatchObject({ isDerby: null, homeUpcoming: null, awayUpcoming: null });
    const s = buildMatchSituation({ match, homeId: 1, awayId: 2, homeRows: [], awayRows: [], standings: null, extras });
    expect(s).toMatchObject({
      isDerby: null,
      stage: 'Quarter-finals',
      leg: '2/2',
      weather: { tempC: 12, condition: 'rain' },
      firstLeg: { home: 'B', away: 'A', score: '2-1' },
      home: { lastMatch: null, nextMatch: null, streak: null, league: null },
    });

    const league = buildMatchSituation({
      match: { id: 12, date: '2026-11-08', stage: 'Regular Season', round: '11' } as Match,
      homeId: 1, awayId: 2, homeRows: [], awayRows: [], standings: null, extras,
    });
    expect(league.stage).toBeUndefined();
    expect(league.round).toBeUndefined();

    vi.mocked(getFirstLeg).mockClear();
    await fetchSituationExtras({ id: 11, date: '2026-11-08', leg: '1/2' } as Match, 1, 2);
    expect(getFirstLeg).not.toHaveBeenCalled();
  });
});
