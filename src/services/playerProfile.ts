/**
 * Oyuncu detay verisi (Sportmonks `Player` havuzu). Tek çağrı bio + sezon istatistiği + transfer geçmişi getirir:
 * `GET /players/{id}?include=nationality;city;position;detailedPosition;metadata.type;teams.team;transfers.type;transfers.fromTeam;
 * transfers.toTeam;statistics.details.type;statistics.season.league;statistics.team` (2026-09-19, Osimhen ile doğrulandı).
 *
 * Sezon bilinmeden `playerStatisticSeasons` filtresi uygulanamaz (sezon listesi bu yanıttan çıkıyor) → varsayılan çağrı
 * filtresiz (16 sezon, ~140KB, proxy'de 30 dk cache'li); `seasonId` verilirse filtre eklenir (yalnızca o sezon, ~20KB).
 * xG/xGOT ve piyasa değeri Sportmonks planında YOK — modelde alanı bile yok. Kupa listesi v1 kapsamı dışı.
 */
import { sportmonksClientRequest } from './sportmonksRuntimeClient';
import type { Match } from '@/models/liveScore';
import { extractLineupRating } from './sportmonksKatman2Mapper';
import type { PlayerStatValue } from './sportmonks/playerStatTypes';
import { STAT, statMain } from './sportmonks/playerStatTypes';

export const PLAYER_PROFILE_INCLUDE =
  'nationality;city;position;detailedPosition;metadata.type;teams.team;transfers.type;transfers.fromTeam;transfers.toTeam;' +
  'statistics.details.type;statistics.season.league;statistics.team';

/** Ham Sportmonks şekli (yalnızca kullanılan alanlar). */
type RawTeam = { id?: number; name?: string; image_path?: string | null };
export type RawPlayer = {
  id: number;
  display_name?: string;
  name?: string;
  common_name?: string;
  image_path?: string | null;
  date_of_birth?: string | null;
  height?: number | null;
  weight?: number | null;
  nationality?: { name?: string; image_path?: string | null } | null;
  city?: { name?: string } | null;
  position?: { name?: string } | null;
  detailedposition?: { name?: string } | null;
  metadata?: Array<{ type?: { name?: string; developer_name?: string }; values?: unknown }>;
  teams?: Array<{ team_id?: number; start?: string | null; end?: string | null; team?: RawTeam }>;
  transfers?: Array<{
    id: number;
    date?: string | null;
    type?: { name?: string; developer_name?: string } | null;
    amount?: number | null;
    completed?: boolean;
    fromteam?: RawTeam | null;
    toteam?: RawTeam | null;
  }>;
  statistics?: Array<{
    season_id: number;
    team_id?: number;
    has_values?: boolean;
    season?: { name?: string; starting_at?: string | null; ending_at?: string | null; league?: { name?: string } } | null;
    team?: RawTeam | null;
    details?: Array<{ type_id: number; value?: PlayerStatValue }>;
  }>;
};

export type PlayerSeasonStats = {
  /** Açılır listede tekil anahtar: aynı sezon id'si farklı takımda tekrarlanabilir (transfer). */
  key: string;
  /** Yerel/kıta kupası (lig değil) — listede ligden sonra gelir. */
  isCup: boolean;
  seasonId: number;
  seasonName: string;
  leagueName?: string;
  teamId?: number;
  teamName?: string;
  teamLogo?: string;
  startingAt?: string;
  endingAt?: string;
  /** `type_id → ham değer` (biçimlendirme `playerStatTypes.formatStat`). */
  stats: Record<number, PlayerStatValue>;
};

export type PlayerTransfer = {
  id: number;
  date?: string;
  /** "Transfer" | "Loan" | "End of loan" … (Sportmonks `type.name`) */
  type: string;
  fromTeam?: { id?: number; name: string; logo?: string };
  toTeam?: { id?: number; name: string; logo?: string };
  /** Bedel (para birimi verilmiyor); kiralık/kiralık dönüşünde `null`. */
  amount: number | null;
  completed: boolean;
};

export type PlayerProfile = {
  id: number;
  name: string;
  photo?: string;
  dateOfBirth?: string;
  heightCm?: number;
  weightKg?: number;
  nationality?: { name: string; flag?: string };
  birthCity?: string;
  position?: string;
  detailedPosition?: string;
  preferredFoot?: string;
  currentTeam?: { id?: number; name: string; logo?: string };
  /** Verisi olan sezonlar, en yeni önce. */
  seasons: PlayerSeasonStats[];
  transfers: PlayerTransfer[];
};

const team = (t?: RawTeam | null) =>
  t?.name ? { ...(t.id != null ? { id: t.id } : {}), name: t.name, ...(t.image_path ? { logo: t.image_path } : {}) } : undefined;

function preferredFoot(meta: RawPlayer['metadata']): string | undefined {
  const m = meta?.find((x) => x.type?.name === 'Preferred Foot' || x.type?.developer_name === 'PREFERRED_FOOT');
  const v = typeof m?.values === 'string' ? m.values : undefined;
  return v;
}

const CUP_RE = /cup|champions|europa|conference|kupa|play-?off|qualif|shield|friendl/i;
export const isCupCompetition = (name: string | undefined) => CUP_RE.test(name ?? '');

const shiftDays = (iso: string, days: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/**
 * Sezon listesi sırası: sezon (azalan, "2025/2026" etiketi — lig ve kupa farklı season_id taşır) → sezon içinde takım
 * (kronolojik: önceki takım önce) → takım içinde turnuva (lig önce, kupalar sonra; eşitlikte çok maç oynanan önce).
 * Takım sırası, sezon penceresi (başlangıç-120g … bitiş) içindeki "o takıma transfer" tarihinden çıkar; penceresinde
 * geliş kaydı olmayan takım sezona zaten orada başlamıştır → en öne. (`teams[]` üyelik tarihleri Trabzonspor gibi
 * geçmiş takımlar için eksik geldiğinden güvenilmiyor — Uğurcan Çakır 2025/26 ile doğrulandı.)
 */
export function sortSeasonRows<T extends { seasonName: string; seasonId: number; teamId?: number; leagueName?: string; isCup: boolean; stats: Record<number, PlayerStatValue>; startingAt?: string; endingAt?: string }>(
  rows: T[],
  transfers: Array<{ date?: string; toTeam?: { id?: number } }>,
): T[] {
  const arrival = (r: T): string => {
    if (r.teamId == null || !r.startingAt || !r.endingAt) return '0000-00-00';
    const lo = shiftDays(r.startingAt, -120);
    const hits = transfers.filter((t) => t.toTeam?.id === r.teamId && t.date && t.date >= lo && t.date <= r.endingAt!).map((t) => t.date!);
    return hits.length ? hits.sort().at(-1)! : '0000-00-00';
  };
  const played = (r: T) => statMain(r.stats[STAT.APPEARANCES]) ?? 0;
  const keyed = rows.map((r) => ({ r, arrival: arrival(r) }));
  return keyed
    .sort(
      (a, b) =>
        b.r.seasonName.localeCompare(a.r.seasonName) ||
        a.arrival.localeCompare(b.arrival) ||
        (a.r.teamId ?? 0) - (b.r.teamId ?? 0) ||
        Number(a.r.isCup) - Number(b.r.isCup) ||
        played(b.r) - played(a.r) ||
        b.r.seasonId - a.r.seasonId,
    )
    .map((x) => x.r);
}

/** Varsayılan seçim: en güncel sezonun SON takım bloğundaki ilk (lig) satır — yani aktif sezon + şu anki takım. */
export function pickDefaultSeason<T extends { seasonName: string; teamId?: number }>(sorted: T[]): T | undefined {
  const first = sorted[0];
  if (!first) return undefined;
  const sameSeason = sorted.filter((r) => r.seasonName === first.seasonName);
  const lastTeam = sameSeason.at(-1)!.teamId;
  return sameSeason.find((r) => r.teamId === lastTeam) ?? first;
}

export function mapPlayerProfile(raw: RawPlayer): PlayerProfile {
  const transfers: PlayerTransfer[] = (raw.transfers ?? [])
    .map((t) => ({
      id: t.id,
      ...(t.date ? { date: t.date } : {}),
      type: t.type?.name ?? 'Transfer',
      ...(team(t.fromteam) ? { fromTeam: team(t.fromteam)! } : {}),
      ...(team(t.toteam) ? { toTeam: team(t.toteam)! } : {}),
      amount: typeof t.amount === 'number' && t.amount > 0 ? t.amount : null,
      completed: t.completed !== false,
    }))
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));

  const seasons: PlayerSeasonStats[] = sortSeasonRows(
    (raw.statistics ?? [])
      .filter((s) => (s.details?.length ?? 0) > 0)
      .map((s) => ({
        key: `${s.season_id}-${s.team_id ?? 0}`,
        isCup: isCupCompetition(s.season?.league?.name),
        seasonId: s.season_id,
        seasonName: s.season?.name ?? String(s.season_id),
        ...(s.season?.league?.name ? { leagueName: s.season.league.name } : {}),
        ...(s.team_id != null ? { teamId: s.team_id } : {}),
        ...(s.team?.name ? { teamName: s.team.name } : {}),
        ...(s.team?.image_path ? { teamLogo: s.team.image_path } : {}),
        ...(s.season?.starting_at ? { startingAt: s.season.starting_at } : {}),
        ...(s.season?.ending_at ? { endingAt: s.season.ending_at } : {}),
        stats: Object.fromEntries((s.details ?? []).map((d) => [d.type_id, d.value])),
      })),
    transfers,
  );

  // Güncel takım: `teams[]` içinde bitişi henüz gelmemiş (sözleşmesi süren) kayıt; yoksa son sezon satırının takımı.
  const today = new Date().toISOString().slice(0, 10);
  const active = (raw.teams ?? []).find((t) => t.team?.name && (!t.end || t.end >= today));
  const latest = pickDefaultSeason(seasons);
  const current = team(active?.team) ?? (latest?.teamName ? { ...(latest.teamId != null ? { id: latest.teamId } : {}), name: latest.teamName, ...(latest.teamLogo ? { logo: latest.teamLogo } : {}) } : undefined);

  return {
    id: raw.id,
    name: raw.display_name ?? raw.name ?? raw.common_name ?? '',
    ...(raw.image_path ? { photo: raw.image_path } : {}),
    ...(raw.date_of_birth ? { dateOfBirth: raw.date_of_birth } : {}),
    ...(raw.height ? { heightCm: raw.height } : {}),
    ...(raw.weight ? { weightKg: raw.weight } : {}),
    ...(raw.nationality?.name ? { nationality: { name: raw.nationality.name, ...(raw.nationality.image_path ? { flag: raw.nationality.image_path } : {}) } } : {}),
    ...(raw.city?.name ? { birthCity: raw.city.name } : {}),
    ...(raw.position?.name ? { position: raw.position.name } : {}),
    ...(raw.detailedposition?.name ? { detailedPosition: raw.detailedposition.name } : {}),
    ...(preferredFoot(raw.metadata) ? { preferredFoot: preferredFoot(raw.metadata) } : {}),
    ...(current ? { currentTeam: current } : {}),
    seasons,
    transfers,
  };
}

/** Oyuncu profilini çeker; bulunamazsa/hata olursa `null`. `seasonId` → tek sezonluk (küçük) yanıt. */
export async function getPlayerProfile(playerId: string | number, seasonId?: number): Promise<PlayerProfile | null> {
  try {
    const envelope = await sportmonksClientRequest<RawPlayer>('football', `/players/${playerId}`, {
      include: PLAYER_PROFILE_INCLUDE,
      ...(seasonId != null ? { filters: `playerStatisticSeasons:${seasonId}` } : {}),
    });
    return envelope.data ? mapPlayerProfile(envelope.data) : null;
  } catch (error) {
    console.error('Error fetching player profile (sportmonks)', error);
    return null;
  }
}

// ── Maç geçmişi ─────────────────────────────────────────────────────────────

export type PlayerMatchRow = {
  matchId: number;
  date?: string;
  /** Oyuncunun takımı ev sahibi mi. */
  isHome: boolean;
  opponent: string;
  opponentLogo?: string;
  score?: string;
  /** Kadroda hiç yoksa `false` (kırmızı değil, bilgi notu: "Kadroda yok"). */
  inSquad: boolean;
  started?: boolean;
  minutes?: number;
  rating?: number;
  goals?: number;
  assists?: number;
};

export type RawFixtureForPlayer = {
  id: number;
  starting_at?: string;
  participants?: Array<{ id: number; name?: string; image_path?: string | null; meta?: { location?: string } }>;
  scores?: Array<{ description?: string; participant_id?: number; score?: { goals?: number; participant?: string } }>;
  lineups?: Array<{ player_id: number; team_id: number; type_id: number; details?: Array<{ type_id: number; data?: { value?: number | string } }> }>;
};

/** `fixtures/{id}?include=participants;scores;lineups.details` → oyuncunun o maçtaki satırı. */
export function mapFixtureToPlayerMatchRow(fx: RawFixtureForPlayer, playerId: number, teamId: number): PlayerMatchRow {
  const me = fx.participants?.find((p) => p.id === teamId);
  const opp = fx.participants?.find((p) => p.id !== teamId);
  const goals = (id: number) => fx.scores?.filter((s) => s.description === 'CURRENT' && s.participant_id === id).map((s) => s.score?.goals)[0];
  const myGoals = goals(teamId);
  const oppGoals = opp ? goals(opp.id) : undefined;
  const row = fx.lineups?.find((l) => l.player_id === playerId);
  const val = (typeId: number): number | undefined => {
    const v = row?.details?.find((d) => d.type_id === typeId)?.data?.value;
    const n = typeof v === 'string' ? Number.parseFloat(v) : v;
    return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
  };
  const pos = (n: number | undefined) => (n != null && n > 0 ? n : undefined); // "0" gösterilmez
  const isHome = me?.meta?.location === 'home';
  return {
    matchId: fx.id,
    ...(fx.starting_at ? { date: fx.starting_at.slice(0, 10) } : {}),
    isHome,
    opponent: opp?.name ?? '',
    ...(opp?.image_path ? { opponentLogo: opp.image_path } : {}),
    ...(myGoals != null && oppGoals != null ? { score: isHome ? `${myGoals}-${oppGoals}` : `${oppGoals}-${myGoals}` } : {}),
    inSquad: Boolean(row),
    ...(row ? { started: row.type_id === 11 } : {}),
    ...(pos(val(STAT.MINUTES)) !== undefined ? { minutes: pos(val(STAT.MINUTES)) } : {}),
    ...(extractLineupRating(row?.details as never) !== undefined ? { rating: extractLineupRating(row?.details as never) } : {}),
    ...(pos(val(STAT.GOALS)) !== undefined ? { goals: pos(val(STAT.GOALS)) } : {}),
    ...(pos(val(STAT.ASSISTS)) !== undefined ? { assists: pos(val(STAT.ASSISTS)) } : {}),
  };
}

/**
 * Oyuncunun (takımının) bitmiş son maçları için satırlar. NOT (performans): takımın maç listesi 1-2 istek
 * (`getTeamHistoryMatches`), ama oyuncunun o maçtaki dakika/rating/gol verisi HER MAÇ İÇİN ayrı bir
 * `fixtures/{id}?include=lineups.details` çağrısı gerektiriyor (Fixture havuzu) → çağıran küçük N ister
 * (varsayılan 5, "Tümünü Göster" ile kalanlar tembel). İleride: oyuncu bazlı toplu endpoint/cache ile optimize edilebilir.
 */
export async function getPlayerMatchRows(
  matches: Match[],
  playerId: number,
  teamId: number,
): Promise<PlayerMatchRow[]> {
  const rows = await Promise.all(
    matches.map(async (m) => {
      try {
        const env = await sportmonksClientRequest<RawFixtureForPlayer>('football', `/fixtures/${m.id}`, {
          include: 'participants;scores;lineups.details',
        });
        return env.data ? mapFixtureToPlayerMatchRow(env.data, playerId, teamId) : null;
      } catch (error) {
        console.error(`Error fetching player match ${m.id} (sportmonks)`, error);
        return null;
      }
    }),
  );
  return rows.filter((r): r is PlayerMatchRow => r != null);
}
