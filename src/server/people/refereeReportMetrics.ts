/**
 * Hakem AI raporu için deterministik metrikler (bkz. config/refereeReportPrompt.ts). Bütün hesaplar KODDA yapılır;
 * LLM yalnızca bu sayıları yorumlar (hesap hatası / uydurma sayı riski olmasın). Girdi: hakem sayfasının ISR verisi
 * (`RefereePageData`) — ek Sportmonks isteği yok.
 */
import type { RefereePageData, RefereeRates } from '@/server/people/refereePage';
import type { RefereeSeasonTableRow } from '@/services/sportmonks/refereeStats';
import { TURKEY_BIG_TEAM_IDS } from '@/config/gameMatchPriority';

/** Ana ligde trend için en çok bu kadar sezon (en yeni). */
export const TREND_SEASONS = 3;
/** Bu sayının altındaki maça dayanan değer "örneklem küçük". */
export const SMALL_MATCHES = 10;
/** Bu sayının altındaki olay (kırmızı, penaltı, VAR) "örneklem küçük". */
export const SMALL_EVENTS = 5;

type RateKey = 'yellow' | 'red' | 'penalties' | 'var';
const RATE_KEYS: readonly RateKey[] = ['yellow', 'red', 'penalties', 'var'];

export type LeagueNamer = (leagueId: number | null) => string;

export type CurrentMetric = {
  key: RateKey;
  value: number | null;
  leagueAvg: number | null;
  /** (değer / lig ort. − 1) × 100, bir ondalık. */
  diffPct: number | null;
  /** Yaklaşık olay sayısı (maç başı × maç). */
  events: number | null;
  smallSample: boolean;
};

export type TrendRow = {
  seasonName: string;
  matches: number;
  yellow: number | null;
  red: number | null;
  penalties: number | null;
  fouls: number | null;
  var: number | null;
  yellowPerFoul: number | null;
  penaltiesPerFoul: number | null;
};

export type OtherCompetitionRow = { league: string; seasonName: string; matches: number; yellow: number | null; red: number | null; penalties: number | null; var: number | null };

export type TeamGroupStat = { teams: number; teamMatches: number; yellow: number; yellowPerTeamMatch: number | null; penaltiesFor: number };

export type TeamBreakdownMetrics = {
  seasonName: string;
  matchCount: number;
  totals: { yellow: number; red: number; penaltiesFor: number };
  /** Aynı sezon adındaki sezon tablosu satırlarından (bütün ligler): maç başı × maç, yuvarlanmış. */
  seasonTableTotals: { matches: number; yellow: number | null; red: number | null; penalties: number | null };
  big4: TeamGroupStat | null;
  others: TeamGroupStat;
  /** En az 2 maçlı takımlar, takım-maç başı sarıya göre azalan (en çok 5). */
  highCardTeams: { name: string; matches: number; yellow: number; red: number; yellowPerMatch: number }[];
  /** Lehine penaltı alan takımlar. */
  penaltiesFor: { name: string; matches: number; penaltiesFor: number }[];
  /** En çok maçı yönetilen takımlar (en çok 5). */
  mostFrequent: { name: string; matches: number }[];
};

export type RecentMetrics = {
  league: string;
  matches: number;
  goals: number;
  goalsPerMatch: number | null;
  homeWins: number;
  draws: number;
  awayWins: number;
  teams: { name: string; count: number }[];
  pairs: {
    id: number;
    home: string;
    away: string;
    homeId: number;
    awayId: number;
    homeLogo?: string;
    awayLogo?: string;
    /** Skor okunamadıysa null. */
    goals: [number, number] | null;
    score: string;
    date: string | null;
    league: string;
    /** Ana lig maçı mı. */
    main: boolean;
  }[];
};

export type RefereeReportMetrics = {
  name: string;
  country: string | null;
  mainLeague: { id: number | null; name: string } | null;
  currentSeason: { seasonName: string; matches: number; leagueAvgAvailable: boolean; metrics: CurrentMetric[] } | null;
  trend: TrendRow[];
  /** Ana ligin trend sezonlarında maç ağırlıklı ortalama (sarı, kırmızı, penaltı, VAR) + toplam maç. */
  weighted: { matches: number; rates: RefereeRates; vsLeagueAvgPct: Record<RateKey, number | null> } | null;
  otherCompetitions: OtherCompetitionRow[];
  teams: TeamBreakdownMetrics | null;
  recent: RecentMetrics;
  totalMatches: number;
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const r1 = (n: number) => Math.round(n * 10) / 10;
const r3 = (n: number) => Math.round(n * 1000) / 1000;

export function pctDiff(value: number | null, avg: number | null): number | null {
  if (value == null || avg == null || avg <= 0) return null;
  return r1((value / avg - 1) * 100);
}

function ratio(a: number | null, b: number | null, round = r3): number | null {
  if (a == null || b == null || b <= 0) return null;
  return round(a / b);
}

const rowRate = (row: RefereeSeasonTableRow, k: RateKey) =>
  k === 'yellow' ? row.yellowPerMatch : k === 'red' ? row.redPerMatch : k === 'penalties' ? row.penaltiesPerMatch : row.varPerMatch;

/** Maç ağırlıklı ortalama (değeri olmayan satır payda da paydada da yok). */
function weighted(rows: readonly RefereeSeasonTableRow[], get: (r: RefereeSeasonTableRow) => number | null): number | null {
  let total = 0;
  let matches = 0;
  for (const r of rows) {
    const v = get(r);
    if (v == null || r.matches <= 0) continue;
    total += v * r.matches;
    matches += r.matches;
  }
  return matches > 0 ? r2(total / matches) : null;
}

function parseScore(score: string | undefined): [number, number] | null {
  const m = /(\d+)\s*[-–:]\s*(\d+)/.exec(score ?? '');
  return m ? [Number(m[1]), Number(m[2])] : null;
}

function groupStat(rows: readonly { matches: number; yellow: number; penaltiesFor: number }[]): TeamGroupStat {
  const teamMatches = rows.reduce((n, r) => n + r.matches, 0);
  const yellow = rows.reduce((n, r) => n + r.yellow, 0);
  return {
    teams: rows.length,
    teamMatches,
    yellow,
    yellowPerTeamMatch: teamMatches > 0 ? r2(yellow / teamMatches) : null,
    penaltiesFor: rows.reduce((n, r) => n + r.penaltiesFor, 0),
  };
}

function teamMetrics(data: RefereePageData): TeamBreakdownMetrics | null {
  const season = data.teams.seasons.find((s) => s.seasonName === data.teams.defaultSeason) ?? data.teams.seasons[0];
  if (!season || season.rows.length === 0) return null;
  const rows = season.rows;
  const tableRows = data.seasons.filter((r) => r.seasonName === season.seasonName);
  const tableMatches = tableRows.reduce((n, r) => n + r.matches, 0);
  const tableTotal = (k: RateKey) => {
    const known = tableRows.filter((r) => rowRate(r, k) != null);
    return known.length ? Math.round(known.reduce((n, r) => n + (rowRate(r, k) ?? 0) * r.matches, 0)) : null;
  };
  const big = rows.filter((r) => TURKEY_BIG_TEAM_IDS.has(r.teamId));
  const rest = rows.filter((r) => !TURKEY_BIG_TEAM_IDS.has(r.teamId));
  return {
    seasonName: season.seasonName,
    matchCount: season.matchCount,
    totals: {
      yellow: rows.reduce((n, r) => n + r.yellow, 0),
      red: rows.reduce((n, r) => n + r.red, 0),
      penaltiesFor: rows.reduce((n, r) => n + r.penaltiesFor, 0),
    },
    seasonTableTotals: { matches: tableMatches, yellow: tableTotal('yellow'), red: tableTotal('red'), penalties: tableTotal('penalties') },
    big4: big.length ? groupStat(big) : null,
    others: groupStat(rest),
    highCardTeams: rows
      .filter((r) => r.matches >= 2)
      .map((r) => ({ name: r.name, matches: r.matches, yellow: r.yellow, red: r.red, yellowPerMatch: r2(r.yellow / r.matches) }))
      .sort((a, b) => b.yellowPerMatch - a.yellowPerMatch || b.matches - a.matches)
      .slice(0, 5),
    penaltiesFor: rows
      .filter((r) => r.penaltiesFor > 0)
      .map((r) => ({ name: r.name, matches: r.matches, penaltiesFor: r.penaltiesFor }))
      .sort((a, b) => b.penaltiesFor - a.penaltiesFor || a.name.localeCompare(b.name, 'tr')),
    mostFrequent: [...rows]
      .sort((a, b) => b.matches - a.matches || a.name.localeCompare(b.name, 'tr'))
      .slice(0, 5)
      .map((r) => ({ name: r.name, matches: r.matches })),
  };
}

function recentMetrics(data: RefereePageData, mainLeagueId: number | null, leagueName: LeagueNamer): RecentMetrics {
  const all = data.recent.map((m) => {
    const s = parseScore(m.scores?.ft_score || m.scores?.score);
    const leagueId = m.competition?.id ?? null;
    return { m, s, leagueId, league: leagueName(leagueId) || m.competition?.name || '' };
  });
  const inMain = all.filter((x) => mainLeagueId != null && x.leagueId === mainLeagueId && x.s);
  const counts = new Map<string, number>();
  for (const x of inMain) for (const n of [x.m.home.name, x.m.away.name]) counts.set(n, (counts.get(n) ?? 0) + 1);
  const goals = inMain.reduce((n, x) => n + x.s![0] + x.s![1], 0);
  return {
    league: leagueName(mainLeagueId),
    matches: inMain.length,
    goals,
    goalsPerMatch: inMain.length ? r2(goals / inMain.length) : null,
    homeWins: inMain.filter((x) => x.s![0] > x.s![1]).length,
    draws: inMain.filter((x) => x.s![0] === x.s![1]).length,
    awayWins: inMain.filter((x) => x.s![0] < x.s![1]).length,
    teams: [...counts.entries()]
      .filter(([, c]) => c >= 2)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'tr'))
      .map(([name, count]) => ({ name, count })),
    pairs: all.map((x) => ({
      id: x.m.id,
      home: x.m.home.name,
      away: x.m.away.name,
      homeId: x.m.home.id,
      awayId: x.m.away.id,
      ...(x.m.home.logo ? { homeLogo: x.m.home.logo } : {}),
      ...(x.m.away.logo ? { awayLogo: x.m.away.logo } : {}),
      goals: x.s,
      main: mainLeagueId != null && x.leagueId === mainLeagueId,
      score: x.s ? `${x.s[0]}-${x.s[1]}` : '—',
      date: (x.m.date ?? x.m.scheduled ?? '').slice(0, 10) || null,
      league: x.league,
    })),
  };
}

export function buildRefereeReportMetrics(data: RefereePageData, leagueName: LeagueNamer): RefereeReportMetrics {
  const ctx = data.summary.context;
  const mainLeagueId = ctx?.leagueId ?? null;
  const mainRows = data.seasons.filter((r) => r.leagueId === mainLeagueId);
  // Ana ligde en yeni üç sezon (aynı sezon adında tek satır beklenir; yine de sezon adına göre tekilleştir).
  const trendRows: RefereeSeasonTableRow[] = [];
  for (const r of mainRows) if (!trendRows.some((x) => x.seasonName === r.seasonName) && trendRows.length < TREND_SEASONS) trendRows.push(r);

  const currentSeason = ctx
    ? {
        seasonName: ctx.seasonName,
        matches: ctx.matches,
        leagueAvgAvailable: ctx.leagueAvg != null,
        metrics: RATE_KEYS.map((k): CurrentMetric => {
          const value = ctx.rates[k];
          const events = value == null ? null : Math.round(value * ctx.matches);
          return {
            key: k,
            value,
            leagueAvg: ctx.leagueAvg?.[k] ?? null,
            diffPct: pctDiff(value, ctx.leagueAvg?.[k] ?? null),
            events,
            smallSample: ctx.matches < SMALL_MATCHES || (k !== 'yellow' && (events ?? 0) < SMALL_EVENTS),
          };
        }),
      }
    : null;

  const weightedMatches = trendRows.reduce((n, r) => n + r.matches, 0);
  const weightedRates: RefereeRates = {
    yellow: weighted(trendRows, (r) => r.yellowPerMatch),
    red: weighted(trendRows, (r) => r.redPerMatch),
    penalties: weighted(trendRows, (r) => r.penaltiesPerMatch),
    var: weighted(trendRows, (r) => r.varPerMatch),
  };

  return {
    name: data.name,
    country: data.country?.name ?? null,
    mainLeague: ctx ? { id: mainLeagueId, name: leagueName(mainLeagueId) } : null,
    currentSeason,
    trend: trendRows.map((r) => ({
      seasonName: r.seasonName,
      matches: r.matches,
      yellow: r.yellowPerMatch,
      red: r.redPerMatch,
      penalties: r.penaltiesPerMatch,
      fouls: r.foulsPerMatch,
      var: r.varPerMatch,
      yellowPerFoul: ratio(r.yellowPerMatch, r.foulsPerMatch),
      penaltiesPerFoul: ratio(r.penaltiesPerMatch, r.foulsPerMatch, (n) => Math.round(n * 10000) / 10000),
    })),
    weighted: trendRows.length
      ? {
          matches: weightedMatches,
          rates: weightedRates,
          vsLeagueAvgPct: Object.fromEntries(RATE_KEYS.map((k) => [k, pctDiff(weightedRates[k], ctx?.leagueAvg?.[k] ?? null)])) as Record<RateKey, number | null>,
        }
      : null,
    otherCompetitions: data.seasons
      .filter((r) => r.leagueId !== mainLeagueId)
      .map((r) => ({
        league: leagueName(r.leagueId) || '—',
        seasonName: r.seasonName,
        matches: r.matches,
        yellow: r.yellowPerMatch,
        red: r.redPerMatch,
        penalties: r.penaltiesPerMatch,
        var: r.varPerMatch,
      })),
    teams: teamMetrics(data),
    recent: recentMetrics(data, mainLeagueId, leagueName),
    totalMatches: data.summary.totalMatches,
  };
}
