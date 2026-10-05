/**
 * Hakem sayfası (/hakem/[slug]) verisi — sunucuda (ISR), Sportmonks istekleri paylaşımlı cache'ten:
 * - profil `referees/{id}?include=country` (7 gün), sezon istatistikleri (hakem kartıyla ortak anahtar, 12 sa),
 * - görev aldığı maçlar `referees/{id}?include=fixtures` (eşleme satırları: fixture_id + görev; 1 sa),
 * - maç ayrıntısı `fixtures/multi` (20'lik; yalnız katılımcı + skor + olay türü — kart / penaltı için).
 * Takım kırılımı bu sezonun bütün orta hakemlik maçlarından (en çok 3 × 20 maç); bu sezon maçı yoksa son 20 maç.
 * Hesaplanan kırılım Redis'te 24 sa.
 */
import type { Match } from '@/models/liveScore';
import { sportmonksClientRequest } from '@/services/sportmonksRuntimeClient';
import { mapSportmonksFixtureToMatch } from '@/services/sportmonksFixtureMapper';
import type { SportmonksFixture } from '@/services/sportmonks/types';
import { mapSportmonksStateToPhase } from '@/services/sportmonks/stateMapping';
import { REFEREE_TYPE_IDS } from '@/services/sportmonks/refereeFormatter';
import { refereeSeasonTable, type RefereeSeasonLine, type RefereeSeasonTableRow } from '@/services/sportmonks/refereeStats';
import { refereeTeamBreakdown, type BreakdownFixture, type TeamBreakdownRow } from '@/services/sportmonks/refereeTeamBreakdown';
import { loadRefereeStatsRaw } from '@/server/refereeSummary';
import { withRedis } from '@/lib/redis';
import { cacheKeyPrefix } from '@/lib/cacheNamespace';
import { loadWithSwr, peekSwr } from '@/server/swrCache';
import { runInBackground } from '@/server/backgroundTask';
import { loadRefereeLeagueTable, refereeTableCacheKey } from '@/server/people/refereeLeagueTable';
import { REFEREE_TABLE_LEAGUES, seasonSlugOf } from '@/config/refereeTableLeagues';

const MULTI_SIZE = 20;
/** Takım kırılımı (bütün sezonlar) için en çok bu kadar 20'lik parça (160 orta hakemlik maçı). */
const MAX_BREAKDOWN_CHUNKS = 8;
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

export type RefereeRates = { yellow: number | null; red: number | null; penalties: number | null; var: number | null };

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
  summary: RefereeSummaryCards;
  seasons: RefereeSeasonTableRow[];
  recent: PersonRecentMatch[];
  teams: RefereeTeamBreakdowns;
};

type RawRefereeProfile = {
  id?: number;
  display_name?: string;
  common_name?: string;
  name?: string;
  country?: { name?: string; iso2?: string | null; image_path?: string | null } | null;
};
type RawRefereeFixtures = { fixtures?: { fixture_id?: number; type_id?: number }[] | null };

async function loadProfile(id: number): Promise<RawRefereeProfile | null | 'missing'> {
  try {
    const env = await sportmonksClientRequest<RawRefereeProfile>('football', `/referees/${id}`, { include: 'country' });
    return env.data && !Array.isArray(env.data) && env.data.id ? env.data : 'missing';
  } catch (e) {
    return (e as { status?: number })?.status === 404 ? 'missing' : null;
  }
}

async function loadMainRefereeFixtureIds(id: number): Promise<number[]> {
  try {
    const env = await sportmonksClientRequest<RawRefereeFixtures>('football', `/referees/${id}`, { include: 'fixtures' });
    const rows = env.data && !Array.isArray(env.data) ? (env.data.fixtures ?? []) : [];
    // Yeni sezon fikstürleri en büyük id'lerde (fikstür sezon başında topluca açılır).
    return [...new Set(rows.filter((r) => r.type_id === REFEREE_TYPE_IDS.MAIN).map((r) => r.fixture_id).filter((x): x is number => typeof x === 'number'))].sort((a, b) => b - a);
  } catch {
    return [];
  }
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

async function breakdownFromCache(key: string): Promise<RefereeTeamBreakdowns | null> {
  return withRedis((r) => r.get<RefereeTeamBreakdowns>(key), null);
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

type RateLine = Pick<RefereeSeasonTableRow, 'matches' | 'yellowPerMatch' | 'redPerMatch' | 'penaltiesPerMatch' | 'varPerMatch'>;

/** Maç ağırlıklı ortalama (değeri olmayan satırlar hem paydan hem paydadan düşer). */
export function weightedRates(lines: readonly RateLine[]): RefereeRates {
  const avg = (get: (l: RateLine) => number | null) => {
    let total = 0;
    let matches = 0;
    for (const l of lines) {
      const v = get(l);
      if (v == null || l.matches <= 0) continue;
      total += v * l.matches;
      matches += l.matches;
    }
    return matches > 0 ? Math.round((total / matches) * 100) / 100 : null;
  };
  return { yellow: avg((l) => l.yellowPerMatch), red: avg((l) => l.redPerMatch), penalties: avg((l) => l.penaltiesPerMatch), var: avg((l) => l.varPerMatch) };
}

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

/**
 * Sayfa verisi Redis'te stale-while-revalidate (taze 1 sa, saklama 7 gün): süresi dolunca eski veri hemen, yenisi
 * arka planda (bkz. server/swrCache.ts); "yok" (404) cache'lenmez. Hiç veri yokken ilk üretim eşzamanlı.
 */
export async function loadRefereePage(id: number): Promise<RefereePageData | 'missing' | null> {
  let missing = false;
  const res = await loadWithSwr<RefereePageData>(`${cacheKeyPrefix()}people:referee-page:v2:${id}`, { freshSeconds: 60 * 60 }, async () => {
    const r = await computeRefereePage(id);
    if (r === 'missing') missing = true;
    return r === 'missing' ? null : r;
  });
  if (res) return res.value;
  return missing ? 'missing' : null;
}

async function computeRefereePage(id: number): Promise<RefereePageData | 'missing' | null> {
  const [profile, statsRaw, mainIds] = await Promise.all([loadProfile(id), loadRefereeStatsRaw(id), loadMainRefereeFixtureIds(id)]);
  if (profile === 'missing') return 'missing';
  if (!profile) return null;

  const stats = statsRaw?.statistics ?? [];
  const currentSeasonName = stats.find((s) => s.season?.is_current)?.season?.name ?? null;
  const seasonNameById = new Map(stats.map((s) => [s.season_id ?? s.season?.id ?? 0, s.season?.name ?? '']).filter(([id, n]) => id && n) as [number, string][]);
  const firstChunk = await loadMulti(mainIds.slice(0, MULTI_SIZE));
  const recent = firstChunk.filter(isFinished).sort(byKickoffDesc).slice(0, RECENT_COUNT).map(toRecentMatch);

  // Takım kırılımı bütün sezonlar için (orta hakemlik maçları, en çok 8 × 20); hesap Redis'te 24 sa.
  const cacheKey = `${cacheKeyPrefix()}people:ref-teams:v2:${id}:${mainIds.length}`;
  let teams = await breakdownFromCache(cacheKey);
  if (!teams) {
    const fetched: SportmonksFixture[] = [...firstChunk];
    for (let chunk = 1; chunk < MAX_BREAKDOWN_CHUNKS && chunk * MULTI_SIZE < mainIds.length; chunk++) {
      fetched.push(...(await loadMulti(mainIds.slice(chunk * MULTI_SIZE, (chunk + 1) * MULTI_SIZE))));
    }
    teams = breakdownsBySeason(fetched, seasonNameById, currentSeasonName);
    if (firstChunk.length) await withRedis((r) => r.set(cacheKey, teams, { ex: BREAKDOWN_TTL_SECONDS }), null);
  }

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
    summary,
    seasons,
    recent,
    teams,
  };
}
