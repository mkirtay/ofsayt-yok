/**
 * AI analizi için "maç bağlamı": sayıların dışında maçı etkileyen durum bilgisi (prompt v7).
 *
 * - Hava: yalnız maça etki edebilecek uç koşullar (yağış, sis, güçlü rüzgâr, çok soğuk/sıcak) prompt'a gider.
 * - Derbi: Sportmonks takım `rivals` listesi (`loadIsDerby`, takım başına 24 sa önbellek).
 * - Kupa: tur (`stage`/`round`), ayak ("2/2") ve 1. ayak skoru.
 * - Takım başına: dinlenme süresi + önceki maçın turnuvası, sıradaki maç (takım sayfasıyla aynı önbellekli
 *   `upcoming` isteği, Team havuzu), seri (yenilmezlik / galibiyetsizlik / üst üste galibiyet-mağlubiyet),
 *   ligdeki durum (lidere ve küme hattına puan farkı, kalan maç).
 *
 * Saf hesaplar dışa açık (test); veri çeken tek fonksiyon `fetchSituationExtras`, her parça hatada sessizce düşer —
 * bağlam eksik diye analiz düşmemeli.
 */
import type { Match, MatchWeather } from '@/models/liveScore';
import type { CompetitionTableData, CompetitionTableStandingRow } from '@/services/liveScoreService';
import { getTeamUpcomingFixtures } from '@/services/liveScoreService';
import { getFirstLeg } from '@/services/firstLeg';
import { loadIsDerby } from '@/server/teamRivals';
import {
  getStandingRankZone,
  PREMIER_LEAGUE_COMPETITION_ID,
  STANDINGS_ZONES_BY_COMPETITION,
  SUPER_LIG_COMPETITION_ID,
  zoneRuleCompetitionId,
} from '@/config/standingsZones';
import type { RecentMatchRow } from '@/server/buildMatchAnalysisContext';

export type TeamSituation = {
  /** Bu maçtan önceki son resmî maç. */
  lastMatch: { daysBefore: number; opponent: string; isHome: boolean; competition?: string } | null;
  /** Bu maçtan sonraki ilk maç. */
  nextMatch: { daysAfter: number; opponent: string; isHome: boolean; competition?: string } | null;
  /** Yalnız dikkat çekici seriler (≥ 3 üst üste galibiyet/mağlubiyet, ≥ 4 yenilmezlik/galibiyetsizlik). */
  streak: { kind: 'wins' | 'losses' | 'unbeaten' | 'winless'; count: number; atLeast: boolean } | null;
  league: {
    rank: number;
    teams: number;
    pointsToLeader: number;
    /** Pozitif: küme hattının üstünde bu kadar puan; negatif: hattın içinde. Küme düşmesi olmayan tabloda yok. */
    pointsAboveRelegation?: number;
    remaining?: number;
  } | null;
};

export type MatchSituation = {
  /** Yalnız uç koşul varsa dolu. */
  weather: MatchWeather | null;
  /** `null` = rakip listesi okunamadı. */
  isDerby: boolean | null;
  stage?: string;
  round?: string;
  leg?: string;
  /** 2. ayakta: 1. ayağın skoru (ev sahibi önce, o maçın ev sahibine göre). */
  firstLeg: { home: string; away: string; score: string } | null;
  home: TeamSituation;
  away: TeamSituation;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function dayNumber(date: string | undefined): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date ?? '');
  return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / DAY_MS : null;
}

/** Güçlü rüzgâr eşiği (m/s): ~29 km/sa, uzun topu ve ortaları belirgin etkiler. */
export const STRONG_WIND_MS = 8;

/** Maça etki edebilecek hava mı (yağış, fırtına, kar, sis, güçlü rüzgâr, ≤ 2 °C ya da ≥ 30 °C). */
export function notableWeather(w: MatchWeather | undefined): MatchWeather | null {
  if (!w) return null;
  const c = w.condition;
  const wet = c === 'rain' || c === 'storm' || c === 'snow' || c === 'fog';
  const windy = (w.windMs ?? 0) >= STRONG_WIND_MS;
  const extremeTemp = w.tempC <= 2 || w.tempC >= 30;
  return wet || windy || extremeTemp ? w : null;
}

/** Bu maçtan önce oynanmış (skorlu) satırlar, yeni → eski. */
function playedBefore(rows: RecentMatchRow[], matchDay: number | null): RecentMatchRow[] {
  return rows.filter((r) => {
    if (r.result === 'U') return false;
    const d = dayNumber(r.date);
    return d != null && (matchDay == null || d < matchDay);
  });
}

export function lastMatchBefore(rows: RecentMatchRow[], matchDate: string | undefined): TeamSituation['lastMatch'] {
  const matchDay = dayNumber(matchDate);
  const last = playedBefore(rows, matchDay)[0];
  if (!last || matchDay == null) return null;
  const d = dayNumber(last.date)!;
  return {
    daysBefore: matchDay - d,
    opponent: last.opponent,
    isHome: last.isHome,
    ...(last.competition ? { competition: last.competition } : {}),
  };
}

export function computeStreak(rows: RecentMatchRow[], matchDate: string | undefined): TeamSituation['streak'] {
  const played = playedBefore(rows, dayNumber(matchDate));
  if (!played.length) return null;
  const run = (ok: (r: RecentMatchRow['result']) => boolean) => {
    let n = 0;
    while (n < played.length && ok(played[n]!.result)) n += 1;
    return n;
  };
  const candidates: Array<{ kind: NonNullable<TeamSituation['streak']>['kind']; count: number; min: number }> = [
    { kind: 'wins', count: run((r) => r === 'W'), min: 3 },
    { kind: 'losses', count: run((r) => r === 'L'), min: 3 },
    { kind: 'unbeaten', count: run((r) => r !== 'L'), min: 4 },
    { kind: 'winless', count: run((r) => r !== 'W'), min: 4 },
  ];
  // Üst üste galibiyet/mağlubiyet daha keskin bilgi; yenilmezlik serisi ondan uzunsa onu söyle.
  const hit = candidates.filter((c) => c.count >= c.min).sort((a, b) => b.count - a.count)[0];
  if (!hit) return null;
  return { kind: hit.kind, count: hit.count, atLeast: hit.count === played.length };
}

export function nextMatchAfter(upcoming: Match[], match: Match, teamId: number): TeamSituation['nextMatch'] {
  const matchDay = dayNumber(match.date);
  if (matchDay == null) return null;
  for (const m of upcoming) {
    if (m.id === match.id) continue;
    const d = dayNumber(m.date);
    if (d == null || d <= matchDay) continue;
    const homeId = m.home?.id ?? m.home_id;
    const isHome = homeId === teamId;
    const opponent = (isHome ? m.away?.name : m.home?.name) ?? '?';
    const competition = m.competition?.name ?? m.competition_name;
    return { daysAfter: d - matchDay, opponent, isHome, ...(competition ? { competition } : {}) };
  }
  return null;
}

/** Tek tablolu (lig) puan durumu satırları; gruplu/çok aşamalı tabloda `null` (lider/küme farkı anlamsız). */
function singleTable(standings: CompetitionTableData | null): CompetitionTableStandingRow[] | null {
  if (!standings) return null;
  if (standings.table?.length) return standings.table;
  const groups = (standings.stages ?? []).flatMap((s) => s.groups ?? []).filter((g) => g.standings?.length);
  return groups.length === 1 ? groups[0]!.standings! : null;
}

/**
 * Küme düşme sırası sayısı — yalnız kuralı açıkça tanımlı ligler (Süper Lig, Premier Lig, config'teki özel kurallar).
 * Diğer ligler varsayılan kurala (son 5) düşüyor; bu çoğu ligde yanlış olduğu için modele küme farkı verilmez.
 */
function relegationSpots(competitionId: number | undefined, teams: number): number {
  const cid = zoneRuleCompetitionId(competitionId);
  const explicit = cid === SUPER_LIG_COMPETITION_ID || cid === PREMIER_LEAGUE_COMPETITION_ID || (cid != null && cid in STANDINGS_ZONES_BY_COMPETITION);
  if (!explicit) return 0;
  let n = 0;
  for (let r = 1; r <= teams; r += 1) if (getStandingRankZone(r, teams, competitionId) === 'relegation') n += 1;
  return n < teams ? n : 0;
}

export function leagueSituation(standings: CompetitionTableData | null, teamId: number): TeamSituation['league'] {
  const rows = singleTable(standings);
  if (!rows || rows.length < 4) return null;
  const sorted = [...rows].sort((a, b) => a.rank - b.rank);
  const own = sorted.find((r) => Number(r.team?.id ?? r.team_id) === teamId);
  if (!own) return null;
  const teams = sorted.length;
  const competitionId = standings?.competition?.id;
  const nRel = relegationSpots(competitionId, teams);
  const out: NonNullable<TeamSituation['league']> = {
    rank: own.rank,
    teams,
    pointsToLeader: sorted[0]!.points - own.points,
  };
  // Küme hattı: düşmeyen son sıradaki takımın puanı (hattın içindeyse ilk güvenli sıraya göre negatif fark).
  if (nRel > 0) {
    const safeRow = sorted[teams - nRel - 1];
    const firstDropRow = sorted[teams - nRel];
    if (safeRow && firstDropRow) {
      out.pointsAboveRelegation = own.rank <= teams - nRel ? own.points - firstDropRow.points : own.points - safeRow.points;
    }
  }
  // Çift devreli lig varsayımı; UEFA lig aşaması gibi büyük tablolarda (36 takım, 8 maç) anlamsız.
  const total = 2 * (teams - 1);
  if (teams <= 24 && own.matches <= total) out.remaining = total - own.matches;
  return out;
}

export function buildTeamSituation(
  teamId: number,
  rows: RecentMatchRow[],
  match: Match,
  upcoming: Match[] | null,
  standings: CompetitionTableData | null,
): TeamSituation {
  return {
    lastMatch: lastMatchBefore(rows, match.date),
    nextMatch: upcoming ? nextMatchAfter(upcoming, match, teamId) : null,
    streak: computeStreak(rows, match.date),
    league: leagueSituation(standings, teamId),
  };
}

function firstLegSummary(first: Match | null): MatchSituation['firstLeg'] {
  const score = first?.scores?.ft_score || first?.scores?.score;
  if (!first || !score || !first.home?.name || !first.away?.name) return null;
  return { home: first.home.name, away: first.away.name, score };
}

export type SituationExtras = {
  isDerby: boolean | null;
  homeUpcoming: Match[] | null;
  awayUpcoming: Match[] | null;
  firstLeg: Match | null;
};

/** Veri çeken kısım (takım bağlamıyla paralel başlatılır); her istek bağımsız ve hatada düşer. */
export async function fetchSituationExtras(match: Match, homeId: number, awayId: number): Promise<SituationExtras> {
  const upcoming = (id: number) =>
    getTeamUpcomingFixtures(String(id))
      .then((u) => u.fixtures)
      .catch(() => null);
  const needsFirstLeg = match.leg === '2/2' && !match.aggregate;
  const [isDerby, homeUpcoming, awayUpcoming, firstLeg] = await Promise.all([
    loadIsDerby(homeId, awayId).catch(() => null),
    upcoming(homeId),
    upcoming(awayId),
    needsFirstLeg ? getFirstLeg(match).catch(() => null) : Promise.resolve(null),
  ]);
  return { isDerby, homeUpcoming, awayUpcoming, firstLeg };
}

/** Lig maçında aşama adı ("Regular Season") ve hafta numarası bilgi taşımaz. */
function isRegularSeason(stage: string): boolean {
  return /regular season/i.test(stage);
}

export function buildMatchSituation(input: {
  match: Match;
  homeId: number;
  awayId: number;
  homeRows: RecentMatchRow[];
  awayRows: RecentMatchRow[];
  standings: CompetitionTableData | null;
  extras: SituationExtras;
}): MatchSituation {
  const { match, homeId, awayId, standings, extras } = input;
  return {
    weather: notableWeather(match.weather),
    isDerby: extras.isDerby,
    ...(match.stage && !isRegularSeason(match.stage) ? { stage: match.stage } : {}),
    ...(match.round && match.stage && !isRegularSeason(match.stage) ? { round: match.round } : {}),
    ...(match.leg ? { leg: match.leg } : {}),
    firstLeg: firstLegSummary(extras.firstLeg),
    home: buildTeamSituation(homeId, input.homeRows, match, extras.homeUpcoming, standings),
    away: buildTeamSituation(awayId, input.awayRows, match, extras.awayUpcoming, standings),
  };
}
