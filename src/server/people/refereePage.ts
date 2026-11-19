/**
 * Hakem sayfası (/hakem/[slug]) verisi — sunucuda (ISR), Sportmonks istekleri paylaşımlı cache'ten:
 * - TEK `referees/{id}` isteği (`REFEREE_PAGE_INCLUDE`): profil (ülke) + sezon istatistikleri + görev aldığı maçlar
 *   (eşleme satırları: fixture_id + görev); 6 sa (bkz. cachePolicy `referees`). Önce üç ayrı istekti (7 g / 12 sa / 1 sa).
 * - maç ayrıntısı `fixtures/multi` (20'lik SABİT parçalar, bkz. `anchoredChunks`; yalnız katılımcı + skor + olay türü).
 * Takım kırılımı orta hakemlik maçlarından (en yeni 8 parça); hesaplanan kırılım Redis'te 24 sa.
 */
import type { Match } from '@/models/liveScore';
import { sportmonksClientRequest } from '@/services/sportmonksRuntimeClient';
import { mapSportmonksFixtureToMatch } from '@/services/sportmonksFixtureMapper';
import type { SportmonksFixture } from '@/services/sportmonks/types';
import { mapSportmonksStateToPhase } from '@/services/sportmonks/stateMapping';
import { REFEREE_TYPE_IDS } from '@/services/sportmonks/refereeFormatter';
import { refereeSeasonTable, type RefereeSeasonLine, type RefereeSeasonTableRow } from '@/services/sportmonks/refereeStats';
import { refereeTeamBreakdown, type BreakdownFixture, type TeamBreakdownRow } from '@/services/sportmonks/refereeTeamBreakdown';
import { REFEREE_STATS_INCLUDE } from '@/server/refereeSummary';
import type { RawReferee } from '@/services/sportmonks/refereeStats';
import { fitsInRedis, withRedis } from '@/lib/redis';
import { cacheKeyPrefix } from '@/lib/cacheNamespace';
import { loadWithSwr, peekSwr } from '@/server/swrCache';
import { runInBackground } from '@/server/backgroundTask';
import { loadRefereeLeagueTable, refereeTableCacheKey } from '@/server/people/refereeLeagueTable';
import { REFEREE_TABLE_LEAGUES, seasonSlugOf } from '@/config/refereeTableLeagues';
import { personPhoto } from '@/utils/personPhoto';
import { weightedRates, type RefereeRates } from '@/utils/refereeAverages';

const TURKEY_COUNTRY_ID = 404;
/** Sıradaki görevler (atanmış, başlamamış orta hakemlik maçları; en yeni parçadan, ek istek yok). */
const UPCOMING_COUNT = 3;
/** Türk takımlarıyla maçlar (yabancı hakem; takım kırılımının yüklediği parçalardan). */
const TR_MATCHES_COUNT = 20;

const MULTI_SIZE = 20;
/** Takım kırılımı (bütün sezonlar) için en çok bu kadar 20'lik parça (160 orta hakemlik maçı). */
const MAX_BREAKDOWN_CHUNKS = 8;
/** Sayfa verisi (SWR) ve ISR: tek Sportmonks isteğinin önbelleğiyle aynı 6 sa (haftada ~1 maç; yeni atama ≤ 6 sa gecikir). */
export const REFEREE_PAGE_FRESH_SECONDS = 6 * 60 * 60;
const RECENT_COUNT = 10;
const BREAKDOWN_TTL_SECONDS = 24 * 60 * 60;
const MULTI_INCLUDE = 'participants;scores;events:type_id,participant_id;league:name,image_path';

export type PersonRecentMatch = Pick<Match, 'id' | 'date' | 'scheduled' | 'home' | 'away' | 'scores' | 'status' | 'competition'>;

/** Bir sezonun (sezon adı; o sezondaki bütün ligler birlikte) takım kırılımı. */
export type RefereeSeasonBreakdown = { seasonName: string; matchCount: number; rows: TeamBreakdownRow[] };

export type RefereeTeamBreakdowns = {
  /** Yeni sezon önce; yalnız maçı olan sezonlar. */
  seasons: RefereeSeasonBreakdown[];
  /** Seçili gelen sezon: güncel sezon, yoksa en son. */
  defaultSeason: string | null;
};

export type { RefereeRates } from '@/utils/refereeAverages';

/** Üst özet: kapsanan toplam maç + en son sezonun ana ligindeki maç başı değerler ve aynı lig-sezonun hakem ortalaması. */
export type RefereeSummaryCards = {
  totalMatches: number;
  seasonCount: number;
  context: { seasonId: number; seasonName: string; leagueId: number | null; matches: number; rates: RefereeRates; leagueAvg: RefereeRates | null } | null;
};

export type RefereePageData = {
  id: number;
  name: string;
  country: { name: string; iso2?: string; flag?: string } | null;
  /** Sportmonks yer tutucusu değilse (çoğu hakemde yok → baş harf avatarı). */
  photo?: string;
  /** Atanmış, başlamamış orta hakemlik maçları (yakın önce). Eski kayıtlarda alan yok. */
  upcoming?: PersonRecentMatch[];
  /** Yabancı hakem: Türk takımlarının maçları (yeni önce, takım kırılımının kapsadığı en yeni 160 orta hakemlik maçından). */
  trMatches?: PersonRecentMatch[];
  summary: RefereeSummaryCards;
  seasons: RefereeSeasonTableRow[];
  recent: PersonRecentMatch[];
  teams: RefereeTeamBreakdowns;
};

type RawRefereeProfile = {
  id?: number;
  image_path?: string | null;
  display_name?: string;
  common_name?: string;
  name?: string;
  country?: { name?: string; iso2?: string | null; image_path?: string | null } | null;
};
type RawRefereeFixtures = { fixtures?: { fixture_id?: number; type_id?: number }[] | null };
type RawRefereePage = RawRefereeProfile & RawReferee & RawRefereeFixtures;

/**
 * Sayfanın tek isteği. 2026-10-14 gerçek istekle doğrulandı (hakem 62331): ülke, istatistik (9 sezon / 57 detay) ve
 * maç satırları (187) eski üç ayrı istekle birebir aynı.
 */
export const REFEREE_PAGE_INCLUDE = `country;${REFEREE_STATS_INCLUDE};fixtures`;

/** `missing`: Sportmonks 404 / boş; `null`: geçici hata. */
async function loadReferee(id: number): Promise<RawRefereePage | null | 'missing'> {
  try {
    const env = await sportmonksClientRequest<RawRefereePage>('football', `/referees/${id}`, { include: REFEREE_PAGE_INCLUDE });
    return env.data && !Array.isArray(env.data) && env.data.id ? env.data : 'missing';
  } catch (e) {
    return (e as { status?: number })?.status === 404 ? 'missing' : null;
  }
}

/** Orta hakemlik maç id'leri, eskiden yeniye (yeni sezon fikstürleri en büyük id'lerde: fikstür sezon başında topluca açılır). */
export function mainRefereeFixtureIds(raw: RawRefereeFixtures): number[] {
  const rows = raw.fixtures ?? [];
  return [...new Set(rows.filter((r) => r.type_id === REFEREE_TYPE_IDS.MAIN).map((r) => r.fixture_id).filter((x): x is number => typeof x === 'number'))].sort((a, b) => a - b);
}

/**
 * `fixtures/multi` parçaları: EN ESKİ maçtan başlayan sabit 20'lik sınırlar, en yeni `maxChunks` parça, en yeni parça önce.
 * Yeni atama yalnız eklendiği parçayı (çoğunlukla son parça) değiştirir; diğer parçaların önbellek anahtarı aynı kalır. Önce
 * en yeni maçtan dilimleniyordu: her yeni atama bütün sınırları kaydırıp 8 parçanın hepsini yeniden çektiriyordu.
 */
export function anchoredChunks(idsAsc: readonly number[], size: number, maxChunks: number): number[][] {
  const chunks: number[][] = [];
  for (let i = 0; i < idsAsc.length; i += size) chunks.push(idsAsc.slice(i, i + size));
  return chunks.slice(-maxChunks).reverse();
}

export async function loadMulti(ids: number[]): Promise<SportmonksFixture[]> {
  if (!ids.length) return [];
  try {
    const env = await sportmonksClientRequest<SportmonksFixture[]>('football', `/fixtures/multi/${ids.join(',')}`, { include: MULTI_INCLUDE });
    return Array.isArray(env.data) ? env.data : [];
  } catch {
    return [];
  }
}

export const isFinished = (f: SportmonksFixture) => f.state_id != null && mapSportmonksStateToPhase(f.state_id) === 'FINISHED';
export const byKickoffDesc = (a: Pick<SportmonksFixture, 'starting_at'>, b: Pick<SportmonksFixture, 'starting_at'>) => String(b.starting_at ?? '').localeCompare(String(a.starting_at ?? ''));

export function toRecentMatch(f: SportmonksFixture): PersonRecentMatch {
  const m = mapSportmonksFixtureToMatch(f);
  return {
    id: m.id,
    status: m.status,
    home: m.home,
    away: m.away,
    ...(m.date ? { date: m.date } : {}),
    ...(m.scheduled ? { scheduled: m.scheduled } : {}),
    ...(m.scores ? { scores: m.scores } : {}),
    ...(m.competition ? { competition: m.competition } : {}),
  };
}

type BreakdownCache = { teams: RefereeTeamBreakdowns; trMatches: PersonRecentMatch[] };

async function breakdownFromCache(key: string): Promise<BreakdownCache | null> {
  return withRedis((r) => r.get<BreakdownCache>(key), null);
}

const hasTurkishSide = (f: SportmonksFixture) => (f.participants ?? []).some((p) => p.country_id === TURKEY_COUNTRY_ID);

/** Türk takımlarının biten maçları, yeni önce (yabancı hakem sayfası). */
export function turkishMatches(fixtures: readonly SportmonksFixture[], limit = TR_MATCHES_COUNT): PersonRecentMatch[] {
  const byId = new Map(fixtures.filter((f) => isFinished(f) && hasTurkishSide(f)).map((f) => [f.id, f]));
  return [...byId.values()].sort(byKickoffDesc).slice(0, limit).map(toRecentMatch);
}

/** Atanmış ama başlamamış maçlar (yakın önce). */
export function upcomingMatches(fixtures: readonly SportmonksFixture[], now = Date.now(), limit = UPCOMING_COUNT): PersonRecentMatch[] {
  const soon = fixtures.filter((f) => {
    if (f.state_id !== 1) return false; // NS: ertelenen / iptal edilen maç sıradaki görev sayılmaz
    const t = Date.parse(`${String(f.starting_at ?? '').replace(' ', 'T')}Z`);
    return Number.isFinite(t) && t > now - 3 * 60 * 60 * 1000;
  });
  return [...new Map(soon.map((f) => [f.id, f])).values()].sort((a, b) => byKickoffDesc(b, a)).slice(0, limit).map(toRecentMatch);
}

/** Biten maçlar sezon adına göre (sezon id → ad: hakemin istatistik kaydından); yeni sezon önce. */
export function breakdownsBySeason(
  fixtures: readonly SportmonksFixture[],
  seasonNameById: ReadonlyMap<number, string>,
  currentSeasonName: string | null,
): RefereeTeamBreakdowns {
  const groups = new Map<string, SportmonksFixture[]>();
  for (const f of fixtures) {
    if (!isFinished(f) || f.season_id == null) continue;
    const name = seasonNameById.get(f.season_id);
    if (!name) continue;
    groups.set(name, [...(groups.get(name) ?? []), f]);
  }
  const seasons = [...groups.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([seasonName, list]) => ({ seasonName, matchCount: list.length, rows: refereeTeamBreakdown(list as BreakdownFixture[]) }));
  const defaultSeason = seasons.find((s) => s.seasonName === currentSeasonName)?.seasonName ?? seasons[0]?.seasonName ?? null;
  return { seasons, defaultSeason };
}

export { weightedRates } from '@/utils/refereeAverages';

/** Özet bağlamı: en son sezon adındaki en çok maçlı lig satırı. */
export function summaryContextRow(rows: readonly RefereeSeasonTableRow[]): RefereeSeasonTableRow | null {
  const latest = rows[0]?.seasonName;
  if (!latest) return null;
  return [...rows.filter((r) => r.seasonName === latest)].sort((a, b) => b.matches - a.matches)[0] ?? null;
}

/**
 * Lig ortalaması `/hakemler` tablosunun Redis kaydından (ek istek yok). Kayıt yoksa ve lig tabloda varsa tablo arka
 * planda üretilir; bu istekte ortalama gösterilmez.
 */
async function leagueAverage(row: RefereeSeasonTableRow): Promise<RefereeRates | null> {
  const table = await peekSwr<RefereeSeasonLine[]>(refereeTableCacheKey(row.seasonId));
  if (table?.length) return weightedRates(table);
  const league = REFEREE_TABLE_LEAGUES.find((l) => l.id === row.leagueId);
  if (league) runInBackground(() => loadRefereeLeagueTable(league.slug, seasonSlugOf(row.seasonName)));
  return null;
}

/** Sayfa verisinin SWR anahtarı (hakem AI raporu yalnız bu kayıttan okur; ek Sportmonks isteği yok). */
export const refereePageCacheKey = (id: number) => `${cacheKeyPrefix()}people:referee-page:v2:${id}`;

/**
 * Sayfa verisi Redis'te stale-while-revalidate (taze 6 sa, saklama 7 gün): süresi dolunca eski veri hemen, yenisi
 * arka planda (bkz. server/swrCache.ts); "yok" (404) cache'lenmez. Hiç veri yokken ilk üretim eşzamanlı.
 */
export async function loadRefereePage(id: number): Promise<RefereePageData | 'missing' | null> {
  let missing = false;
  const res = await loadWithSwr<RefereePageData>(refereePageCacheKey(id), { freshSeconds: REFEREE_PAGE_FRESH_SECONDS }, async () => {
    const r = await computeRefereePage(id);
    if (r === 'missing') missing = true;
    return r === 'missing' ? null : r;
  });
  if (res) return res.value;
  return missing ? 'missing' : null;
}

async function computeRefereePage(id: number): Promise<RefereePageData | 'missing' | null> {
  const raw = await loadReferee(id);
  if (raw === 'missing') return 'missing';
  if (!raw) return null;
  const profile = raw;
  const statsRaw: RawReferee = raw;
  const mainIds = mainRefereeFixtureIds(raw);

  const stats = statsRaw.statistics ?? [];
  const currentSeasonName = stats.find((s) => s.season?.is_current)?.season?.name ?? null;
  const seasonNameById = new Map(stats.map((s) => [s.season_id ?? s.season?.id ?? 0, s.season?.name ?? '']).filter(([id, n]) => id && n) as [number, string][]);
  // Son maçlar en yeni parçadan; yeterli biten maç yoksa (yeni sezonun atanmış ama oynanmamış maçları) bir önceki parça da.
  const chunks = anchoredChunks(mainIds, MULTI_SIZE, MAX_BREAKDOWN_CHUNKS);
  const loaded: SportmonksFixture[][] = [];
  for (const chunk of chunks) {
    loaded.push(await loadMulti(chunk));
    if (loaded.flat().filter(isFinished).length >= RECENT_COUNT) break;
  }
  const recent = loaded.flat().filter(isFinished).sort(byKickoffDesc).slice(0, RECENT_COUNT).map(toRecentMatch);

  const upcoming = upcomingMatches(loaded.flat());

  // Takım kırılımı bütün sezonlar için (orta hakemlik maçları, en yeni 8 parça) + Türk takımlarıyla maçlar; Redis'te 24 sa.
  const cacheKey = `${cacheKeyPrefix()}people:ref-teams:v3:${id}:${mainIds.length}`;
  let cachedBreakdown = await breakdownFromCache(cacheKey);
  if (!cachedBreakdown) {
    const fetched: SportmonksFixture[] = loaded.flat();
    for (const chunk of chunks.slice(loaded.length)) fetched.push(...(await loadMulti(chunk)));
    const value: BreakdownCache = { teams: breakdownsBySeason(fetched, seasonNameById, currentSeasonName), trMatches: turkishMatches(fetched) };
    cachedBreakdown = value;
    if (loaded[0]?.length && fitsInRedis(value)) await withRedis((r) => r.set(cacheKey, value, { ex: BREAKDOWN_TTL_SECONDS }), null);
  }
  const { teams } = cachedBreakdown;
  const isTurkish = profile.country?.iso2?.toUpperCase() === 'TR';
  const photo = personPhoto(profile.image_path);

  const seasons = refereeSeasonTable(statsRaw);
  const ctxRow = summaryContextRow(seasons);
  const summary: RefereeSummaryCards = {
    totalMatches: seasons.reduce((n, r) => n + r.matches, 0),
    seasonCount: new Set(seasons.map((r) => r.seasonName)).size,
    context: ctxRow
      ? {
          seasonId: ctxRow.seasonId,
          seasonName: ctxRow.seasonName,
          leagueId: ctxRow.leagueId,
          matches: ctxRow.matches,
          rates: weightedRates([ctxRow]),
          leagueAvg: await leagueAverage(ctxRow),
        }
      : null,
  };

  return {
    id,
    name: profile.display_name ?? profile.common_name ?? profile.name ?? '',
    country: profile.country?.name
      ? {
          name: profile.country.name,
          ...(profile.country.iso2 ? { iso2: profile.country.iso2 } : {}),
          ...(profile.country.image_path ? { flag: profile.country.image_path } : {}),
        }
      : null,
    ...(photo ? { photo } : {}),
    ...(upcoming.length ? { upcoming } : {}),
    ...(!isTurkish && cachedBreakdown.trMatches.length ? { trMatches: cachedBreakdown.trMatches } : {}),
    summary,
    seasons,
    recent,
    teams,
  };
}
