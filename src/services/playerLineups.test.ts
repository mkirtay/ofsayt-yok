import { beforeEach, describe, expect, it, vi } from 'vitest';
import sample from './sportmonks/__fixtures__/playerLineupsSample.json';

const calls = vi.hoisted(() => [] as Array<{ path: string; params: Record<string, unknown> }>);
const cache = vi.hoisted(() => new Map<string, { value: unknown; ttl: number }>());
vi.mock('./sportmonksRuntimeClient', () => ({
  sportmonksClientRequest: async (_b: string, path: string, params: Record<string, unknown>) => {
    calls.push({ path, params });
    return { data: { id: 534383, lineups: (sample as unknown as { kerem: { lineups: unknown[] } }).kerem.lineups } };
  },
}));
vi.mock('@/lib/livescoreCache', () => ({
  readCache: async (k: string) => cache.get(k)?.value ?? null,
  writeCache: async (k: string, value: unknown, ttl: number) => void cache.set(k, { value, ttl }),
}));

import {
  countsForAverage,
  getPlayerLineupRows,
  listOpponents,
  mapPlayerLineup,
  mapPlayerLineups,
  playedIn,
  vsOpponent,
  type PlayerLineupRow,
  type RawPlayerLineup,
} from './playerLineups';

const kerem = (sample as unknown as { kerem: { lineups: RawPlayerLineup[] } }).kerem.lineups;
const icardi = (sample as unknown as { icardi: { lineups: RawPlayerLineup[] } }).icardi.lineups;

describe('mapPlayerLineup — gerçek Sportmonks yanıtı', () => {
  it('fixture null (plan dışı) satır atılır', () => {
    const nullRow = kerem.find((l) => !l.fixture)!;
    expect(mapPlayerLineup(nullRow)).toBeNull();
    expect(mapPlayerLineups(kerem).every((r) => r.fixtureId !== nullRow.fixture_id)).toBe(true);
  });

  it('Kerem (Fenerbahçe) vs Galatasaray: takım lineup team_id\'den, skor oyuncunun takımı açısından', () => {
    const rows = mapPlayerLineups(kerem).filter((r) => r.opponentId === 34);
    expect(rows).toHaveLength(2);
    const [apr, dec] = rows; // en yeni önce
    expect(apr).toMatchObject({
      date: '2026-04-26 17:00:00',
      leagueId: 600,
      leagueName: 'Super Lig',
      teamId: 88,
      teamName: 'Fenerbahçe',
      opponentName: 'Galatasaray',
      isHome: false,
      goalsFor: 0,
      goalsAgainst: 3,
      started: true,
      minutes: 66,
      rating: 6.13,
    });
    expect(dec).toMatchObject({ isHome: true, goalsFor: 1, goalsAgainst: 1, minutes: 63, rating: 6.69 });
    expect(apr.goals).toBeUndefined(); // 0 gol yazılmaz
  });

  it('kariyerde takım değişimi: 2021 Randers maçında Kerem Galatasaray tarafında', () => {
    const r = mapPlayerLineups(kerem).find((x) => x.opponentName === 'Randers FC')!;
    expect(r).toMatchObject({ teamId: 34, teamName: 'Galatasaray', isHome: false });
  });

  it('Icardi vs Fenerbahçe: yedekte kalmış (dakika yok) / 1\' reytingsiz / 8\' reytingli', () => {
    const rows = mapPlayerLineups(icardi).filter((r) => r.opponentId === 88);
    expect(rows.map((r) => [r.date.slice(0, 10), r.started, r.minutes, r.rating])).toEqual([
      ['2026-04-26', false, 8, 6.54],
      ['2025-12-01', false, 1, undefined],
      ['2024-09-21', false, undefined, undefined],
    ]);
    expect(rows.map(playedIn)).toEqual([true, true, false]);
    expect(rows.map(countsForAverage)).toEqual([false, false, false]); // 8' < 15', 1' reyting yok
  });

  it('uzatmalı maç (AET, state 7) tamamlanmış sayılır', () => {
    expect(mapPlayerLineups(icardi).some((r) => r.opponentName === 'Juventus')).toBe(true);
  });

  it('tamamlanmamış maç (state ≠ 5/7/8) atılır', () => {
    const live = { ...kerem[0], fixture: { ...kerem[0].fixture!, state_id: 3 } };
    expect(mapPlayerLineup(live)).toBeNull();
  });
});

describe('listOpponents / vsOpponent', () => {
  const row = (p: Partial<PlayerLineupRow>): PlayerLineupRow => ({
    fixtureId: Math.random(),
    date: '2026-01-01 18:00:00',
    leagueId: 600,
    teamId: 1,
    teamName: 'Biz',
    opponentId: 2,
    opponentName: 'Onlar',
    isHome: true,
    started: true,
    ...p,
  });

  it('rakipler sahaya çıkılan maç sayısıyla, çoktan aza; yalnızca yedekte kalınan rakip listede yok', () => {
    const rows = [
      row({ opponentId: 2, opponentName: 'B' }),
      row({ opponentId: 3, opponentName: 'A' }),
      row({ opponentId: 3, opponentName: 'A' }),
      row({ opponentId: 4, opponentName: 'C', started: false }),
    ];
    expect(listOpponents(rows)).toEqual([
      { id: 3, name: 'A', matches: 2 },
      { id: 2, name: 'B', matches: 1 },
    ]);
  });

  it('özet: G/B/M oyuncunun takımı açısından, ortalama yalnızca 15\'+ reytingli, oynamadığı maç ayrı sayılır', () => {
    const rows = [
      row({ goalsFor: 2, goalsAgainst: 0, minutes: 90, rating: 8.0, goals: 1 }),
      row({ goalsFor: 1, goalsAgainst: 1, minutes: 70, rating: 7.0, assists: 2 }),
      row({ goalsFor: 0, goalsAgainst: 3, started: false, minutes: 10, rating: 5.0 }), // < 15': ortalamaya yok
      row({ goalsFor: 0, goalsAgainst: 1, minutes: 60 }), // reyting yok
      row({ goalsFor: 0, goalsAgainst: 1, started: false }), // kadroda, oynamadı
      row({ opponentId: 9 }),
    ];
    const r = vsOpponent(rows, 2);
    expect(r.opponent).toEqual({ id: 2, name: 'Onlar' });
    expect(r.matches).toHaveLength(4);
    expect(r.notPlayed).toBe(1);
    expect(r.summary).toEqual({
      played: 4, won: 1, drawn: 1, lost: 2, averageRating: 7.5, ratedMatches: 2, goals: 1, assists: 2, minutes: 230,
    });
  });

  it('hiç karşılaşmadığı rakip → boş sonuç', () => {
    expect(vsOpponent([row({})], 99)).toMatchObject({ opponent: null, matches: [], notPlayed: 0, summary: { played: 0, averageRating: null } });
  });
});

describe('getPlayerLineupRows — tek istek + 12 saat oyuncu başına cache', () => {
  beforeEach(() => {
    calls.length = 0;
    cache.clear();
  });

  it('ilk çağrı Sportmonks, ikincisi cache', async () => {
    const a = await getPlayerLineupRows(534383);
    const b = await getPlayerLineupRows(534383);
    expect(calls).toEqual([
      {
        path: '/players/534383',
        params: {
          include: 'lineups.fixture.participants;lineups.fixture.scores;lineups.fixture.league:name,image_path;lineups.details',
          filters: 'lineupDetailTypes:118,119,52,79',
        },
      },
    ]);
    expect(cache.get('sportmonks:player-lineups:534383')?.ttl).toBe(12 * 60 * 60);
    expect(b).toEqual(a);
    expect(a!.length).toBeGreaterThan(0);
  });
});
