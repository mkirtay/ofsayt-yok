/**
 * AI maç analizi için zenginleştirilmiş veri context'i oluşturur.
 *
 * Temel API çağrıları + türetilmiş metrikler (form trendi, ev avantajı,
 * gol ortalamaları, H2H dominansı, kadro değişiklikleri).
 *
 * Tüm fonksiyonlar SSR axios context'i içinde de çalışır;
 * `runWithLiveScoreHttpClient` sarmalayıcısı çağıran tarafa bırakılmıştır.
 */
import type { Match } from '@/models/liveScore';
import {
  getCompetitionTableFull,
  getMatchStats,
  getMatchWithEvents,
  getMatchLineups,
  getTeamLastMatches,
  getTeamsHead2Head,
  type CompetitionTableData,
  type CompetitionTableStandingRow,
  type Head2HeadData,
} from '@/services/liveScoreService';
import type { MatchEvent, MatchStatsData } from '@/models/domain';

/** Bir takımın son N maçından çıkarılan özet performans satırı */
export type RecentMatchRow = {
  date: string;
  opponent: string;
  isHome: boolean;
  goalsFor: number;
  goalsAgainst: number;
  /** "W" | "D" | "L" */
  result: 'W' | 'D' | 'L' | 'U';
  scoreText: string;
};

export type TeamMetrics = {
  matchesAnalyzed: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalsPerMatch: number;
  goalsAgainstPerMatch: number;
  cleanSheetRate: number;
  bttsRate: number;
  /** Ev maçlarında galibiyet oranı */
  homeWinRate: number;
  /** Deplasman maçlarında galibiyet oranı */
  awayWinRate: number;
  /** Son 5 maçtaki gol dizileri (trend için) */
  last5GoalsFor: number[];
  last5GoalsAgainst: number[];
  /** "↑" yükselen, "↓" düşen, "→" stabil */
  formTrend: 'rising' | 'falling' | 'stable';
};

export type TeamContext = {
  teamId: number;
  teamName: string;
  recentMatches: RecentMatchRow[];
  metrics: TeamMetrics;
  /** Lig sıralamasında bu takımın satırı (varsa) */
  standingRow: CompetitionTableStandingRow | null;
};

export type H2HContext = {
  /** Toplam karşılaştırılabilir geçmiş maç sayısı */
  totalMatches: number;
  homeWins: number;
  awayWins: number;
  draws: number;
  goalsHome: number;
  goalsAway: number;
  /** Son 3 karşılaşma özeti (en yeni başta) */
  last3: Array<{
    date?: string;
    score?: string;
    homeTeam?: string;
    awayTeam?: string;
  }>;
  /** Ev sahibinin H2H'ta toplam avantajı: -1..+1 */
  homeDominance: number;
};

export type MatchAnalysisContext = {
  match: Match;
  matchPhase: 'PRE' | 'LIVE' | 'HT' | 'POST';
  events: MatchEvent[];
  liveStats: MatchStatsData | null;
  lineups: unknown;
  /** Lig veya turnuva sıralaması (varsa) */
  standings: CompetitionTableData | null;
  homeTeam: TeamContext;
  awayTeam: TeamContext;
  h2h: H2HContext | null;
  /** Pre/live oran karşılaştırması — para akışı sinyali */
  oddsSignal: {
    pre: { '1'?: number; X?: number; '2'?: number } | null;
    live: { '1'?: number; X?: number; '2'?: number } | null;
    /** "home", "draw", "away" yönünde piyasa hareketi (varsa) */
    movement: 'home' | 'draw' | 'away' | 'stable' | null;
  };
};

const STATUS_TO_PHASE: Record<string, MatchAnalysisContext['matchPhase']> = {
  'NOT STARTED': 'PRE',
  SCHEDULED: 'PRE',
  'IN PLAY': 'LIVE',
  'HALF TIME BREAK': 'HT',
  FINISHED: 'POST',
};

function parseScore(raw?: string | null): [number, number] | null {
  if (!raw) return null;
  const m = /(\d+)\s*[-:]\s*(\d+)/.exec(String(raw));
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return [a, b];
}

function buildRecentMatchRow(m: Match, teamId: number): RecentMatchRow | null {
  const homeId = m.home?.id ?? m.home_id;
  const awayId = m.away?.id ?? m.away_id;
  if (homeId == null || awayId == null) return null;
  const isHome = homeId === teamId;
  if (!isHome && awayId !== teamId) return null;

  const scoreSource = m.scores?.ft_score || m.scores?.score || m.score;
  const score = parseScore(scoreSource);
  const opponent = isHome ? (m.away?.name ?? '?') : (m.home?.name ?? '?');

  if (!score) {
    return {
      date: m.date ?? '',
      opponent,
      isHome,
      goalsFor: 0,
      goalsAgainst: 0,
      result: 'U',
      scoreText: scoreSource ?? '',
    };
  }
  const [hg, ag] = score;
  const gf = isHome ? hg : ag;
  const ga = isHome ? ag : hg;
  let result: RecentMatchRow['result'] = 'D';
  if (gf > ga) result = 'W';
  else if (gf < ga) result = 'L';

  return {
    date: m.date ?? '',
    opponent,
    isHome,
    goalsFor: gf,
    goalsAgainst: ga,
    result,
    scoreText: `${hg}-${ag}`,
  };
}

function computeMetrics(rows: RecentMatchRow[]): TeamMetrics {
  const known = rows.filter((r) => r.result !== 'U');
  const total = known.length || 1;
  const wins = known.filter((r) => r.result === 'W').length;
  const draws = known.filter((r) => r.result === 'D').length;
  const losses = known.filter((r) => r.result === 'L').length;

  const goalsFor = known.reduce((s, r) => s + r.goalsFor, 0);
  const goalsAgainst = known.reduce((s, r) => s + r.goalsAgainst, 0);

  const cleanSheets = known.filter((r) => r.goalsAgainst === 0).length;
  const btts = known.filter((r) => r.goalsFor > 0 && r.goalsAgainst > 0).length;

  const homeMatches = known.filter((r) => r.isHome);
  const awayMatches = known.filter((r) => !r.isHome);
  const homeWinRate = homeMatches.length
    ? homeMatches.filter((r) => r.result === 'W').length / homeMatches.length
    : 0;
  const awayWinRate = awayMatches.length
    ? awayMatches.filter((r) => r.result === 'W').length / awayMatches.length
    : 0;

  // Son 5 maç (en yeni başta varsayılır; rows zaten getTeamLastMatches'tan
  // en yeniden eskiye geliyor)
  const last5 = rows.slice(0, 5);
  const last5GoalsFor = last5.map((r) => r.goalsFor);
  const last5GoalsAgainst = last5.map((r) => r.goalsAgainst);

  // Trend: ilk yarısı (eski) ile ikinci yarısı (yeni) puan ortalamasını karşılaştır
  let formTrend: TeamMetrics['formTrend'] = 'stable';
  if (known.length >= 4) {
    const half = Math.floor(known.length / 2);
    const newer = known.slice(0, half);
    const older = known.slice(half);
    const score = (rs: RecentMatchRow[]) =>
      rs.reduce((s, r) => s + (r.result === 'W' ? 3 : r.result === 'D' ? 1 : 0), 0) /
      (rs.length || 1);
    const diff = score(newer) - score(older);
    if (diff > 0.3) formTrend = 'rising';
    else if (diff < -0.3) formTrend = 'falling';
  }

  return {
    matchesAnalyzed: known.length,
    wins,
    draws,
    losses,
    goalsFor,
    goalsAgainst,
    goalsPerMatch: +(goalsFor / total).toFixed(2),
    goalsAgainstPerMatch: +(goalsAgainst / total).toFixed(2),
    cleanSheetRate: +(cleanSheets / total).toFixed(2),
    bttsRate: +(btts / total).toFixed(2),
    homeWinRate: +homeWinRate.toFixed(2),
    awayWinRate: +awayWinRate.toFixed(2),
    last5GoalsFor,
    last5GoalsAgainst,
    formTrend,
  };
}

function findStandingRow(
  standings: CompetitionTableData | null,
  teamId: number
): CompetitionTableStandingRow | null {
  if (!standings) return null;
  const candidates: CompetitionTableStandingRow[] = [];
  if (Array.isArray(standings.table)) candidates.push(...standings.table);
  for (const stage of standings.stages ?? []) {
    for (const group of stage.groups ?? []) {
      if (Array.isArray(group.standings)) candidates.push(...group.standings);
    }
  }
  for (const row of candidates) {
    const id = row.team?.id ?? row.team_id;
    if (id != null && Number(id) === teamId) return row;
  }
  return null;
}

async function buildTeamContext(
  teamId: number,
  teamName: string,
  standings: CompetitionTableData | null
): Promise<TeamContext> {
  const lastMatches = await getTeamLastMatches(String(teamId), 10);
  const rows = lastMatches
    .map((m) => buildRecentMatchRow(m, teamId))
    .filter((r): r is RecentMatchRow => r != null);

  return {
    teamId,
    teamName,
    recentMatches: rows,
    metrics: computeMetrics(rows),
    standingRow: findStandingRow(standings, teamId),
  };
}

function buildH2HContext(
  data: Head2HeadData | null,
  homeTeamName?: string
): H2HContext | null {
  if (!data?.h2h?.length) return null;
  let homeWins = 0;
  let awayWins = 0;
  let draws = 0;
  let goalsHome = 0;
  let goalsAway = 0;

  for (const row of data.h2h) {
    const sc = parseScore(row.score);
    if (!sc) continue;
    const [hg, ag] = sc;
    // h2h satırlarındaki home/away o maça özgü; ev sahibi takım perspektifinden
    // sayım yapmak için isim eşleşmesi kullanılır
    const isCurrentHomeAtHome =
      homeTeamName != null && row.home_name === homeTeamName;
    if (isCurrentHomeAtHome) {
      goalsHome += hg;
      goalsAway += ag;
      if (hg > ag) homeWins++;
      else if (hg < ag) awayWins++;
      else draws++;
    } else {
      // Takımlar yer değiştirmiş — perspektifi çevir
      goalsHome += ag;
      goalsAway += hg;
      if (ag > hg) homeWins++;
      else if (ag < hg) awayWins++;
      else draws++;
    }
  }

  const total = homeWins + awayWins + draws;
  const dominance = total ? +((homeWins - awayWins) / total).toFixed(2) : 0;

  return {
    totalMatches: total,
    homeWins,
    awayWins,
    draws,
    goalsHome,
    goalsAway,
    last3: data.h2h.slice(0, 3).map((r) => ({
      date: r.date,
      score: r.score,
      homeTeam: r.home_name,
      awayTeam: r.away_name,
    })),
    homeDominance: dominance,
  };
}

function computeOddsSignal(match: Match): MatchAnalysisContext['oddsSignal'] {
  const pre = match.odds?.pre ?? null;
  const live = match.odds?.live ?? null;
  if (!pre || !live) {
    return { pre, live, movement: pre || live ? 'stable' : null };
  }
  // Daha düşük oran → daha güçlü; en çok iyileşen taraf piyasa sinyalidir
  const deltas: Array<{ key: 'home' | 'draw' | 'away'; delta: number }> = [];
  if (pre['1'] != null && live['1'] != null) {
    deltas.push({ key: 'home', delta: pre['1'] - live['1'] });
  }
  if (pre['X'] != null && live['X'] != null) {
    deltas.push({ key: 'draw', delta: pre['X'] - live['X'] });
  }
  if (pre['2'] != null && live['2'] != null) {
    deltas.push({ key: 'away', delta: pre['2'] - live['2'] });
  }
  if (!deltas.length) return { pre, live, movement: 'stable' };
  deltas.sort((a, b) => b.delta - a.delta);
  const top = deltas[0]!;
  return { pre, live, movement: top.delta > 0.05 ? top.key : 'stable' };
}

export async function buildMatchAnalysisContext(
  matchId: string
): Promise<MatchAnalysisContext | null> {
  const eventsBundle = await getMatchWithEvents(matchId);
  const match = eventsBundle.match;
  if (!match) return null;

  const homeId = match.home?.id ?? match.home_id;
  const awayId = match.away?.id ?? match.away_id;
  if (homeId == null || awayId == null) return null;

  const compId = match.competition?.id ?? match.competition_id;
  const phase = STATUS_TO_PHASE[match.status] ?? 'PRE';

  const [stats, lineups, standings, h2h] = await Promise.all([
    getMatchStats(matchId),
    getMatchLineups(matchId),
    compId != null ? getCompetitionTableFull(String(compId)) : Promise.resolve(null),
    getTeamsHead2Head(String(homeId), String(awayId)),
  ]);

  const [homeCtx, awayCtx] = await Promise.all([
    buildTeamContext(homeId, match.home?.name ?? '', standings),
    buildTeamContext(awayId, match.away?.name ?? '', standings),
  ]);

  return {
    match,
    matchPhase: phase,
    events: eventsBundle.events,
    liveStats: stats,
    lineups,
    standings,
    homeTeam: homeCtx,
    awayTeam: awayCtx,
    h2h: buildH2HContext(h2h, match.home?.name),
    oddsSignal: computeOddsSignal(match),
  };
}
