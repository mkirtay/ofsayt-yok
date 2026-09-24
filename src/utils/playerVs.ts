/**
 * "Rakibe karşı performans" — SAF kurallar (web istemcisi, API ve mobil aynı mantık). Sunucu tarafı istek + cache:
 * `services/playerLineups.ts`.
 *
 * Kurallar: fixture'ı null (plan dışı) ya da tamamlanmamış maç atılır; oyuncunun takımı her maçta lineup `team_id`'den;
 * kadroda olup oynamadığı maç listede/ortalamada YOK (yalnızca sayısı); < 15 dk maç listede ama ortalamaya girmez;
 * reytingsiz maç ortalamaya girmez.
 */
import { isValidRating } from '@/config/ratingScale';
import { STAT } from '@/services/sportmonks/playerStatTypes';

/** Bu dakikanın ALTINDA oynanan maçın reytingi ortalamaya katılmaz (listede görünür). */
export const MIN_MINUTES_FOR_AVERAGE = 15;
/** Tamamlanmış maç durumları: FT, AET, penaltılar (iptal/terk/hükmen hariç — oyuncu performansı yok/eksik). */
const COMPLETED_STATES = new Set([5, 7, 8]);
/** Lineup `type_id`: 11 ilk 11, 12 yedek. */
const LINEUP_STARTER = 11;

type RawTeam = { id: number; name?: string; image_path?: string | null; meta?: { location?: string } };
export type RawPlayerLineup = {
  fixture_id: number;
  team_id: number;
  type_id: number;
  details?: Array<{ type_id: number; data?: { value?: number | string } }>;
  fixture?: {
    id: number;
    league_id?: number;
    state_id?: number;
    starting_at?: string | null;
    league?: { id?: number; name?: string; image_path?: string | null } | null;
    participants?: RawTeam[];
    scores?: Array<{ description?: string; participant_id?: number; score?: { goals?: number } }>;
  } | null;
};

/** Sıkıştırılmış satır — cache'lenen ve API'nin döndürdüğü şekil (mobil de bunu kullanır). */
export type PlayerLineupRow = {
  fixtureId: number;
  /** "YYYY-MM-DD HH:mm:ss" (UTC, Sportmonks) */
  date: string;
  leagueId: number;
  leagueName?: string;
  leagueLogo?: string;
  /** Oyuncunun O MAÇTAKİ takımı (kariyerde değişir — lineup `team_id`'den) */
  teamId: number;
  teamName: string;
  teamLogo?: string;
  opponentId: number;
  opponentName: string;
  opponentLogo?: string;
  /** Oyuncunun takımı ev sahibi mi */
  isHome: boolean;
  /** Oyuncunun takımının / rakibin golü (CURRENT skor) */
  goalsFor?: number;
  goalsAgainst?: number;
  started: boolean;
  minutes?: number;
  rating?: number;
  goals?: number;
  assists?: number;
};

function detailNumber(details: RawPlayerLineup['details'], typeId: number): number | undefined {
  const v = details?.find((d) => d.type_id === typeId)?.data?.value;
  const n = typeof v === 'string' ? Number.parseFloat(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
}

/** Tek lineup → satır; fixture yok (plan dışı) / tamamlanmamış / takım katılımcılarda yok → `null`. */
export function mapPlayerLineup(l: RawPlayerLineup): PlayerLineupRow | null {
  const fx = l.fixture;
  if (!fx || !COMPLETED_STATES.has(fx.state_id ?? -1)) return null;
  const me = fx.participants?.find((p) => p.id === l.team_id);
  const opp = fx.participants?.find((p) => p.id !== l.team_id);
  if (!me || !opp) return null;
  const current = (id: number) => fx.scores?.find((s) => s.description === 'CURRENT' && s.participant_id === id)?.score?.goals;
  const goalsFor = current(me.id);
  const goalsAgainst = current(opp.id);
  const minutes = detailNumber(l.details, STAT.MINUTES);
  const rating = detailNumber(l.details, STAT.RATING);
  const goals = detailNumber(l.details, STAT.GOALS);
  const assists = detailNumber(l.details, STAT.ASSISTS);
  const leagueName = fx.league?.name;
  return {
    fixtureId: fx.id,
    date: fx.starting_at ?? '',
    leagueId: fx.league_id ?? fx.league?.id ?? 0,
    ...(leagueName ? { leagueName } : {}),
    ...(fx.league?.image_path ? { leagueLogo: fx.league.image_path } : {}),
    teamId: me.id,
    teamName: me.name ?? '',
    ...(me.image_path ? { teamLogo: me.image_path } : {}),
    opponentId: opp.id,
    opponentName: opp.name ?? '',
    ...(opp.image_path ? { opponentLogo: opp.image_path } : {}),
    isHome: me.meta?.location === 'home',
    ...(goalsFor != null ? { goalsFor } : {}),
    ...(goalsAgainst != null ? { goalsAgainst } : {}),
    started: l.type_id === LINEUP_STARTER,
    ...(minutes != null && minutes > 0 ? { minutes } : {}),
    ...(isValidRating(rating) ? { rating } : {}),
    ...(goals != null && goals > 0 ? { goals } : {}),
    ...(assists != null && assists > 0 ? { assists } : {}),
  };
}

/** Tüm lineup'lar → satırlar, en yeni önce; aynı fixture iki kez gelirse ilki. */
export function mapPlayerLineups(lineups: RawPlayerLineup[] | undefined): PlayerLineupRow[] {
  const seen = new Set<number>();
  const rows: PlayerLineupRow[] = [];
  for (const l of lineups ?? []) {
    const row = mapPlayerLineup(l);
    if (!row || seen.has(row.fixtureId)) continue;
    seen.add(row.fixtureId);
    rows.push(row);
  }
  return rows.sort((a, b) => b.date.localeCompare(a.date));
}

/** Sahaya çıktı mı: ilk 11 ya da dakika > 0. Kadroda olup oynamayan (yedekte kalan) maç listede/ortalamada YOK. */
export const playedIn = (r: PlayerLineupRow) => r.started || (r.minutes ?? 0) > 0;

/** Ortalamaya katılır mı: reyting var VE en az 15 dk (ilk 11'de dakika bilgisi yoksa katılır). */
export const countsForAverage = (r: PlayerLineupRow) =>
  r.rating != null && (r.minutes == null ? r.started : r.minutes >= MIN_MINUTES_FOR_AVERAGE);

export type VsOpponent = { id: number; name: string; logo?: string; matches: number };

/** Karşılaşılan rakipler (sahaya çıktığı maç sayısıyla), çoktan aza; eşitlikte ada göre. */
export function listOpponents(rows: PlayerLineupRow[], locale = 'tr'): VsOpponent[] {
  const byId = new Map<number, VsOpponent>();
  for (const r of rows) {
    if (!playedIn(r)) continue;
    const o = byId.get(r.opponentId) ?? { id: r.opponentId, name: r.opponentName, ...(r.opponentLogo ? { logo: r.opponentLogo } : {}), matches: 0 };
    o.matches += 1;
    byId.set(r.opponentId, o);
  }
  return [...byId.values()].sort((a, b) => b.matches - a.matches || a.name.localeCompare(b.name, locale));
}

export type VsSummary = {
  played: number;
  won: number;
  drawn: number;
  lost: number;
  /** 15'+ ve reytingli maçların ortalaması; yoksa null */
  averageRating: number | null;
  /** Ortalamaya katılan maç sayısı */
  ratedMatches: number;
  goals: number;
  assists: number;
  minutes: number;
};

export type VsResult = {
  opponent: { id: number; name: string; logo?: string } | null;
  /** Sahaya çıktığı maçlar, en yeni önce */
  matches: PlayerLineupRow[];
  /** Kadroda olup oynamadığı maç sayısı */
  notPlayed: number;
  summary: VsSummary;
};

export function summarizeVs(played: PlayerLineupRow[]): VsSummary {
  const rated = played.filter(countsForAverage);
  const sum = (f: (r: PlayerLineupRow) => number | undefined) => played.reduce((s, r) => s + (f(r) ?? 0), 0);
  const result = (r: PlayerLineupRow) =>
    r.goalsFor == null || r.goalsAgainst == null ? null : r.goalsFor > r.goalsAgainst ? 'W' : r.goalsFor < r.goalsAgainst ? 'L' : 'D';
  return {
    played: played.length,
    won: played.filter((r) => result(r) === 'W').length,
    drawn: played.filter((r) => result(r) === 'D').length,
    lost: played.filter((r) => result(r) === 'L').length,
    averageRating: rated.length ? rated.reduce((s, r) => s + r.rating!, 0) / rated.length : null,
    ratedMatches: rated.length,
    goals: sum((r) => r.goals),
    assists: sum((r) => r.assists),
    minutes: sum((r) => r.minutes),
  };
}

export function vsOpponent(rows: PlayerLineupRow[], opponentId: number): VsResult {
  const all = rows.filter((r) => r.opponentId === opponentId);
  const played = all.filter(playedIn);
  const any = all[0];
  return {
    opponent: any ? { id: any.opponentId, name: any.opponentName, ...(any.opponentLogo ? { logo: any.opponentLogo } : {}) } : null,
    matches: played,
    notPlayed: all.length - played.length,
    summary: summarizeVs(played),
  };
}

