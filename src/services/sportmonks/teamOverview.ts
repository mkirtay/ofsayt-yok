/**
 * Takım sayfasının TEK isteği — `GET /football/teams/{id}?include=latest.*;upcoming.*`.
 *
 * Neden bu endpoint (2026-10-02'de Galatasaray id=34 ile gerçek istekle doğrulandı):
 *  - `Team` kota havuzundan sayılır (`fixtures/between` gibi kıt `Fixture` havuzundan değil).
 *  - `latest`: takımın plandaki TÜM turnuvalarda oynadığı son 40 maç (GS: Aralık 2025'e kadar); `upcoming`:
 *    sezon sonuna kadarki oynanmamış maçlar. Son Maçlar, Fikstür, başlıktaki form ve sıradaki maç aynı yanıttan.
 *  - Yanıt takımın kendi adını/logosunu da taşır.
 *
 * Canlı maç `latest`'te de `upcoming`'de de gelebilir (Sportmonks hangisine koyduğunu belgelemiyor) → iki liste
 * birleştirilip id ile tekilleştirilir, maç durumuna göre "son maçlar" / "fikstür" diye ayrılır.
 *
 * Mobil uygulamanın kullandığı `upcoming`-yalnız istek (`teamUpcoming.ts`) ayrı ve değişmeden durur.
 */
import type { Match } from '@/models/liveScore';
import { mapSportmonksFixtureToMatch } from '../sportmonksFixtureMapper';
import { isKickoffTimeTbd, type SportmonksTeamWithUpcoming } from './teamUpcoming';
import type { SportmonksFixture, SportmonksVenue } from './types';
import { normalizeDisplayName, normalizeTeamName } from '@/utils/displayName';
import { parseScore } from '@/utils/parseScore';

export const TEAM_OVERVIEW_INCLUDE = [
  'latest.participants',
  'latest.scores',
  'latest.league',
  'latest.state',
  'upcoming.participants',
  'upcoming.league',
  'upcoming.state',
  // Canlı maç `upcoming`'de gelir (2026-10-02, Sporting KC–Seattle 2. yarı: latest'te yok) → skor ve dakika için.
  // Oynanmamış maçlarda boş (GS yanıtı +94 bayt gz).
  'upcoming.scores',
  'upcoming.periods',
  // Faz 2: başlıktaki teknik direktör / stadyum + takımın turnuva-sezonları (güncel sezonun istatistik isteği,
  // geçmiş sezon seçicisi)
  'coaches.coach',
  'venue',
  'seasons.league',
].join(';');

type SportmonksTeamCoachRow = {
  coach_id?: number;
  active?: boolean | null;
  start?: string | null;
  end?: string | null;
  coach?: { id: number; display_name?: string | null; name?: string | null; common_name?: string | null; image_path?: string | null } | null;
};

export type SportmonksTeamSeason = {
  id: number;
  name?: string | null;
  league_id?: number | null;
  is_current?: boolean | null;
  finished?: boolean | null;
  starting_at?: string | null;
  ending_at?: string | null;
  league?: { id: number; name?: string | null; image_path?: string | null; sub_type?: string | null } | null;
};

export type SportmonksTeamOverview = SportmonksTeamWithUpcoming & {
  latest?: SportmonksFixture[] | null;
  coaches?: SportmonksTeamCoachRow[] | null;
  venue?: SportmonksVenue | null;
  seasons?: SportmonksTeamSeason[] | null;
};

/** Takımın bir turnuvadaki bir sezonu (ör. Süper Lig 2026/2027 = 28203). */
export type TeamSeasonRef = {
  id: number;
  name: string;
  leagueId: number;
  leagueName?: string;
  leagueLogo?: string;
  isCurrent: boolean;
  finished: boolean;
  startingAt?: string;
};

/** Aynı adlı sezonlar (ör. "2026/2027": Süper Lig + Şampiyonlar Ligi) = takımın o sezonki tüm turnuvaları. */
export type TeamCampaign = { name: string; seasons: TeamSeasonRef[] };

/** `Match` + ham Sportmonks durum id'si (penaltıyla biten maçı ayırmak için). */
export type TeamMatch = Match & { state_id?: number; kickoff_ts?: number };

export type TeamOverview = {
  team: { id: number; name: string; logo?: string } | null;
  /** Canlı + oynanmış (ve tarihi geçmiş ertelenmiş/iptal) maçlar, en yeniden eskiye. */
  recent: TeamMatch[];
  /** Oynanmamış maçlar, en yakından uzağa (Fikstür sekmesi + "Sıradaki maç"). */
  fixtures: TeamMatch[];
  /** Görevdeki teknik direktör (`coaches` içinde `active=true`). */
  coach?: { id: number; name: string; photo?: string };
  venue?: { name: string; city?: string; capacity?: number };
  /** Sezonlar en yeniden eskiye; [0] güncel sezon. */
  campaigns: TeamCampaign[];
};

function mapCoach(rows: SportmonksTeamCoachRow[] | null | undefined): TeamOverview['coach'] {
  const active = (rows ?? []).filter((r) => r.active === true && r.coach);
  // Birden fazla aktif kayıt (geçici + kalıcı) varsa en son başlayan.
  active.sort((a, b) => (b.start ?? '').localeCompare(a.start ?? ''));
  const c = active[0]?.coach;
  if (!c) return undefined;
  const name = normalizeDisplayName((c.display_name || c.common_name || c.name || '').trim());
  if (!name) return undefined;
  return { id: c.id, name, ...(c.image_path ? { photo: c.image_path } : {}) };
}

function mapVenue(v: SportmonksVenue | null | undefined): TeamOverview['venue'] {
  const name = v?.name?.trim();
  if (!name) return undefined;
  return {
    name,
    ...(v?.city_name?.trim() ? { city: v.city_name.trim() } : {}),
    ...(typeof v?.capacity === 'number' && v.capacity > 0 ? { capacity: v.capacity } : {}),
  };
}

/** Takımın sezonları ada göre gruplanır, en yeniden eskiye. */
export function mapTeamCampaigns(seasons: SportmonksTeamSeason[] | null | undefined): TeamCampaign[] {
  const byName = new Map<string, TeamSeasonRef[]>();
  for (const s of seasons ?? []) {
    const name = s.name?.trim();
    const leagueId = s.league_id ?? s.league?.id;
    if (!s.id || !name || !leagueId) continue;
    const list = byName.get(name) ?? [];
    list.push({
      id: s.id,
      name,
      leagueId,
      ...(s.league?.name ? { leagueName: s.league.name } : {}),
      ...(s.league?.image_path ? { leagueLogo: s.league.image_path } : {}),
      isCurrent: s.is_current === true,
      finished: s.finished === true,
      ...(s.starting_at ? { startingAt: s.starting_at } : {}),
    });
    byName.set(name, list);
  }
  const latestStart = (c: TeamCampaign) => c.seasons.reduce((m, s) => (s.startingAt && s.startingAt > m ? s.startingAt : m), '');
  return [...byName.entries()]
    .map(([name, list]) => ({ name, seasons: list.sort((a, b) => (a.startingAt ?? '').localeCompare(b.startingAt ?? '')) }))
    .sort((a, b) => latestStart(b).localeCompare(latestStart(a)) || b.name.localeCompare(a.name));
}

/** Sportmonks `FTP` (penaltılarla bitti). */
const STATE_FT_PENALTIES = 8;
/** Başlama saati geçmiş ama "başlamadı" görünen maç bu kadar süre fikstürde kalır (durum güncellemesi gecikmesi). */
const NOT_STARTED_GRACE_MS = 3 * 60 * 60 * 1000;

function kickoffMs(fx: Pick<SportmonksFixture, 'starting_at'> & { starting_at_timestamp?: number | null }): number | null {
  if (typeof fx.starting_at_timestamp === 'number') return fx.starting_at_timestamp * 1000;
  if (!fx.starting_at) return null;
  const t = Date.parse(`${fx.starting_at.trim().replace(' ', 'T')}Z`);
  return Number.isFinite(t) ? t : null;
}

export function toTeamMatch(fx: SportmonksFixture): TeamMatch {
  const match = mapSportmonksFixtureToMatch(fx);
  const stateId = fx.state?.id ?? fx.state_id;
  const ts = kickoffMs(fx as SportmonksFixture & { starting_at_timestamp?: number | null });
  return {
    ...match,
    ...(stateId != null ? { state_id: stateId } : {}),
    ...(ts != null ? { kickoff_ts: ts } : {}),
  };
}

/** Aynı maç iki listede gelirse ilerlemiş (başlamış/bitmiş) kopya tutulur. */
function moreAdvanced(a: TeamMatch, b: TeamMatch): TeamMatch {
  const rank = (m: TeamMatch) => (m.status === 'NOT STARTED' ? 0 : m.status === 'FINISHED' ? 2 : 1);
  return rank(b) > rank(a) ? b : a;
}

function sortKey(m: TeamMatch): number {
  if (m.kickoff_ts != null) return m.kickoff_ts;
  const t = Date.parse(`${m.date ?? ''}T${m.scheduled ?? '00:00'}:00Z`);
  return Number.isFinite(t) ? t : 0;
}

/**
 * `latest` + `upcoming` → son maçlar / fikstür. `nowMs` yalnızca "başlamadı" görünen maçın geçmişte kalıp
 * kalmadığına karar verir (tarihi çoktan geçmiş ertelenmiş maç fikstürde değil son maçlarda görünür).
 */
export function mapTeamOverview(team: SportmonksTeamOverview | null | undefined, nowMs: number = Date.now()): TeamOverview {
  if (!team) return { team: null, recent: [], fixtures: [], campaigns: [] };

  const byId = new Map<number, TeamMatch>();
  const tbd = new Set<number>();
  for (const fx of [...(team.latest ?? []), ...(team.upcoming ?? [])]) {
    if (fx?.id == null) continue;
    const m = toTeamMatch(fx);
    if (isKickoffTimeTbd(fx)) tbd.add(fx.id);
    const prev = byId.get(fx.id);
    byId.set(fx.id, prev ? moreAdvanced(prev, m) : m);
  }

  const recent: TeamMatch[] = [];
  const fixtures: TeamMatch[] = [];
  for (const m of byId.values()) {
    if (m.status !== 'NOT STARTED') {
      recent.push(m);
      continue;
    }
    const k = m.kickoff_ts;
    if (k != null && k < nowMs - NOT_STARTED_GRACE_MS) recent.push(m);
    else fixtures.push(tbd.has(m.id) ? { ...m, time_tbd: true } : m);
  }

  recent.sort((a, b) => sortKey(b) - sortKey(a));
  const coach = mapCoach(team.coaches);
  const venue = mapVenue(team.venue);
  fixtures.sort((a, b) => sortKey(a) - sortKey(b));

  return {
    team: {
      id: team.id,
      name: normalizeTeamName(team.name ?? ''),
      ...(team.image_path ? { logo: team.image_path } : {}),
    },
    recent,
    fixtures,
    ...(coach ? { coach } : {}),
    ...(venue ? { venue } : {}),
    campaigns: mapTeamCampaigns(team.seasons),
  };
}

export type FormResult = 'W' | 'D' | 'L';

/**
 * Takımın bu maçtaki sonucu; oynanmamış/iptal/skorsuz maçta null. Skor `CURRENT` (uzatmalar dahil) üzerinden;
 * penaltılarla biten maç her iki takım için B (beraberlik) sayılır.
 */
export function teamMatchResult(match: TeamMatch, teamId: string): FormResult | null {
  if (match.status !== 'FINISHED') return null;
  if (match.state_code && match.state_code !== 'AWARDED' && match.state_code !== 'WALKOVER') return null;
  const parsed = parseScore(match.scores?.score ?? match.scores?.ft_score);
  if (!parsed) return null;
  const isHome = String(match.home?.id) === teamId;
  if (!isHome && String(match.away?.id) !== teamId) return null;
  if (match.state_id === STATE_FT_PENALTIES) return 'D';
  const [hg, ag] = parsed;
  const mine = isHome ? hg : ag;
  const theirs = isHome ? ag : hg;
  if (mine > theirs) return 'W';
  if (mine === theirs) return 'D';
  return 'L';
}

/** Son `count` sonuçlanmış maçın formu, en yeni başta (canlı maç dahil edilmez). */
export function teamForm(recent: TeamMatch[], teamId: string, count = 5): { result: FormResult; match: TeamMatch }[] {
  const out: { result: FormResult; match: TeamMatch }[] = [];
  for (const m of recent) {
    const r = teamMatchResult(m, teamId);
    if (r) out.push({ result: r, match: m });
    if (out.length >= count) break;
  }
  return out;
}

/**
 * Varsayılan turnuva: son `window` maçta en çok oynanan turnuva; eşitlikte en yeni maçı olan. Hiç son maç yoksa
 * fikstürdeki ilk maçın turnuvası.
 */
export function defaultCompetitionId(recent: TeamMatch[], fixtures: TeamMatch[] = [], window = 10): number | null {
  const counts = new Map<number, { n: number; firstIndex: number }>();
  recent.slice(0, window).forEach((m, i) => {
    const id = m.competition?.id;
    if (!id) return;
    const c = counts.get(id);
    if (c) c.n += 1;
    else counts.set(id, { n: 1, firstIndex: i });
  });
  let best: { id: number; n: number; firstIndex: number } | null = null;
  for (const [id, c] of counts) {
    if (!best || c.n > best.n || (c.n === best.n && c.firstIndex < best.firstIndex)) best = { id, ...c };
  }
  return best?.id ?? fixtures.find((m) => m.competition?.id)?.competition?.id ?? null;
}

/** URL'deki sezon değeri: "2025/2026" → "2025-2026". */
export function campaignSlug(name: string): string {
  return name.trim().replace(/\//g, '-');
}

/**
 * Sezon seçicide gösterilecek sezonlar (en yeniden, en çok `max`): yalnız takımın ana liginin (varsayılan
 * turnuva) verisi olan sezonlar. Plan yerel liglerde son 3 sezonu veriyor (Süper Lig 2024/25'ten beri) ama UEFA
 * turnuvalarını çok geriye kadar — ana lig şartı olmasa seçicide yalnız Avrupa maçlarından oluşan eksik sezonlar
 * çıkardı. Ana lig bilinmiyorsa ya da hiçbir sezonda yoksa yalnız güncel sezon.
 */
export function selectableCampaigns(campaigns: TeamCampaign[], primaryLeagueId: number | null, max = 5): TeamCampaign[] {
  if (campaigns.length === 0) return [];
  const withLeague = primaryLeagueId != null ? campaigns.filter((c) => c.seasons.some((s) => s.leagueId === primaryLeagueId)) : [];
  if (withLeague.length === 0) return campaigns.slice(0, 1);
  // Güncel sezon ana ligi henüz içermese de (ör. lig başlamadan) seçicinin başında durur.
  const list = withLeague[0] === campaigns[0] ? withLeague : [campaigns[0]!, ...withLeague];
  return list.slice(0, max);
}
