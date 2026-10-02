/**
 * Takım sezon istatistikleri — `GET /football/teams/{id}?include=statistics.details;statistics.season
 * &filters=teamStatisticSeasons:{sezon id'leri}` (Team havuzu, tek istek; 2026-10-02'de GS 28203/28155 ile
 * doğrulandı: maç listesiyle birebir — SL 6 O, 4-1-1, 13-10, 2 gol yemeden).
 *
 * Kullanılan detay türleri (Sportmonks `type_id`):
 *  27263 GAMES_PLAYED {total,home,away} · 214/215/216 WIN/DRAW/LOST {all,home,away}.count ·
 *  52 GOALS / 88 GOALS_CONCEDED {all,home,away}.count · 194 CLEANSHEET {all,home,away}.count ·
 *  196 SCORING_MINUTES / 213 CONCEDED_SCORING_MINUTES {"0-15":{count},…,"75-90":{count}} (Faz 3 grafiği).
 * `statistics.season` sezonun `finished` bayrağını taşır (bitmiş sezonun uzun önbelleği, bkz. cachePolicy).
 */

import type { SportmonksSidelinedRow } from './teamSidelined';

/** Faz 3: sakat/cezalı oyuncular aynı isteğe eklendi (bkz. teamSidelined.ts) — ayrı istek yok. */
export const TEAM_STATS_INCLUDE = ['statistics.details', 'statistics.season', 'sidelined.player', 'sidelined.type'].join(';');

/** Sezon id'leri sıralı → aynı sezon kümesi hep aynı önbellek anahtarı. */
export function teamStatsFilters(seasonIds: number[]): string {
  return `teamStatisticSeasons:${[...new Set(seasonIds)].sort((a, b) => a - b).join(',')}`;
}

type CountSplit = { all?: { count?: number }; home?: { count?: number }; away?: { count?: number } };

export type SportmonksTeamStatisticDetail = { type_id: number; value: unknown };
export type SportmonksTeamStatistic = {
  season_id: number;
  has_values?: boolean;
  details?: SportmonksTeamStatisticDetail[] | null;
  season?: { id: number; league_id?: number | null; finished?: boolean | null; name?: string | null } | null;
};
export type SportmonksTeamWithStatistics = {
  id: number;
  statistics?: SportmonksTeamStatistic[] | null;
  sidelined?: SportmonksSidelinedRow[] | null;
};

export type SummaryLine = {
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  cleanSheets: number;
};

export const MINUTE_BUCKETS = ['0-15', '15-30', '30-45', '45-60', '60-75', '75-90'] as const;

export type TeamSeasonStats = {
  seasonId: number;
  leagueId?: number;
  finished: boolean;
  total: SummaryLine;
  home: SummaryLine;
  away: SummaryLine;
  /** 15 dakikalık dilimlerde atılan / yenilen gol sayısı (6 dilim; uzatma dakikaları son dilimlerde). */
  scoredByMinute: number[];
  concededByMinute: number[];
};

const T = {
  PLAYED: 27263,
  WIN: 214,
  DRAW: 215,
  LOST: 216,
  GOALS: 52,
  CONCEDED: 88,
  CLEAN: 194,
  SCORING_MINUTES: 196,
  CONCEDED_MINUTES: 213,
} as const;

const emptyLine = (): SummaryLine => ({ played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, cleanSheets: 0 });

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function split(value: unknown): { all: number; home: number; away: number } {
  const v = (value ?? {}) as CountSplit;
  return { all: num(v.all?.count), home: num(v.home?.count), away: num(v.away?.count) };
}

/** "75-90", "90-105"… → dilim indeksi; 75 ve sonrası son dilime. */
function bucketIndex(key: string): number {
  const start = Number(key.split('-')[0]);
  if (!Number.isFinite(start)) return -1;
  return Math.min(MINUTE_BUCKETS.length - 1, Math.max(0, Math.floor(start / 15)));
}

function minutes(value: unknown): number[] {
  const out = MINUTE_BUCKETS.map(() => 0);
  if (!value || typeof value !== 'object') return out;
  for (const [key, v] of Object.entries(value as Record<string, { count?: number }>)) {
    const i = bucketIndex(key);
    if (i >= 0) out[i]! += num(v?.count);
  }
  return out;
}

export function mapTeamSeasonStat(stat: SportmonksTeamStatistic): TeamSeasonStats {
  const byType = new Map<number, unknown>();
  for (const d of stat.details ?? []) byType.set(d.type_id, d.value);
  const played = (byType.get(T.PLAYED) ?? {}) as { total?: number; home?: number; away?: number };
  const won = split(byType.get(T.WIN));
  const drawn = split(byType.get(T.DRAW));
  const lost = split(byType.get(T.LOST));
  const gf = split(byType.get(T.GOALS));
  const ga = split(byType.get(T.CONCEDED));
  const cs = split(byType.get(T.CLEAN));
  const line = (k: 'all' | 'home' | 'away', p: number): SummaryLine => ({
    played: p,
    won: won[k],
    drawn: drawn[k],
    lost: lost[k],
    goalsFor: gf[k],
    goalsAgainst: ga[k],
    cleanSheets: cs[k],
  });
  const leagueId = stat.season?.league_id ?? undefined;
  return {
    seasonId: stat.season_id,
    ...(leagueId ? { leagueId } : {}),
    finished: stat.season?.finished === true,
    total: line('all', num(played.total) || won.all + drawn.all + lost.all),
    home: line('home', num(played.home) || won.home + drawn.home + lost.home),
    away: line('away', num(played.away) || won.away + drawn.away + lost.away),
    scoredByMinute: minutes(byType.get(T.SCORING_MINUTES)),
    concededByMinute: minutes(byType.get(T.CONCEDED_MINUTES)),
  };
}

/** Yanıttaki sezonlar (maç oynanmamış sezonlar dahil); sıralama çağıranın. */
export function mapTeamSeasonStats(team: SportmonksTeamWithStatistics | null | undefined): TeamSeasonStats[] {
  return (team?.statistics ?? []).filter((s) => s?.season_id != null).map(mapTeamSeasonStat);
}

function addLine(a: SummaryLine, b: SummaryLine): SummaryLine {
  return {
    played: a.played + b.played,
    won: a.won + b.won,
    drawn: a.drawn + b.drawn,
    lost: a.lost + b.lost,
    goalsFor: a.goalsFor + b.goalsFor,
    goalsAgainst: a.goalsAgainst + b.goalsAgainst,
    cleanSheets: a.cleanSheets + b.cleanSheets,
  };
}

/** "Tümü" sekmesi: turnuvaların toplamı. */
export function combineSeasonStats(list: TeamSeasonStats[]): TeamSeasonStats {
  return list.reduce<TeamSeasonStats>(
    (acc, s) => ({
      seasonId: 0,
      finished: acc.finished && s.finished,
      total: addLine(acc.total, s.total),
      home: addLine(acc.home, s.home),
      away: addLine(acc.away, s.away),
      scoredByMinute: acc.scoredByMinute.map((v, i) => v + (s.scoredByMinute[i] ?? 0)),
      concededByMinute: acc.concededByMinute.map((v, i) => v + (s.concededByMinute[i] ?? 0)),
    }),
    {
      seasonId: 0,
      finished: list.length > 0,
      total: emptyLine(),
      home: emptyLine(),
      away: emptyLine(),
      scoredByMinute: MINUTE_BUCKETS.map(() => 0),
      concededByMinute: MINUTE_BUCKETS.map(() => 0),
    },
  );
}
