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
import { currentSeasonIds, refereeSeasonTable, type RefereeSeasonTableRow } from '@/services/sportmonks/refereeStats';
import { refereeTeamBreakdown, type BreakdownFixture, type TeamBreakdownRow } from '@/services/sportmonks/refereeTeamBreakdown';
import { loadRefereeStatsRaw } from '@/server/refereeSummary';
import { withRedis } from '@/lib/redis';
import { cacheKeyPrefix } from '@/lib/cacheNamespace';

const MULTI_SIZE = 20;
const MAX_SEASON_CHUNKS = 3;
const RECENT_COUNT = 10;
const BREAKDOWN_TTL_SECONDS = 24 * 60 * 60;
const MULTI_INCLUDE = 'participants;scores;events:type_id,participant_id;league:name';

export type PersonRecentMatch = Pick<Match, 'id' | 'date' | 'scheduled' | 'home' | 'away' | 'scores' | 'status' | 'competition'>;

export type RefereeTeamBreakdown = {
  /** `season` = bu sezonun bütün maçları; `last` = son N maç (bu sezon maçı yoksa) */
  scope: 'season' | 'last';
  /** Sezon adı (scope = season), ör. "2026/2027" */
  seasonName: string | null;
  matchCount: number;
  rows: TeamBreakdownRow[];
};

export type RefereePageData = {
  id: number;
  name: string;
  country: { name: string; flag?: string } | null;
  seasons: RefereeSeasonTableRow[];
  recent: PersonRecentMatch[];
  teams: RefereeTeamBreakdown;
};

type RawRefereeProfile = {
  id?: number;
  display_name?: string;
  common_name?: string;
  name?: string;
  country?: { name?: string; image_path?: string | null } | null;
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

async function loadMulti(ids: number[]): Promise<SportmonksFixture[]> {
  if (!ids.length) return [];
  try {
    const env = await sportmonksClientRequest<SportmonksFixture[]>('football', `/fixtures/multi/${ids.join(',')}`, { include: MULTI_INCLUDE });
    return Array.isArray(env.data) ? env.data : [];
  } catch {
    return [];
  }
}

const isFinished = (f: SportmonksFixture) => f.state_id != null && mapSportmonksStateToPhase(f.state_id) === 'FINISHED';
const byKickoffDesc = (a: SportmonksFixture, b: SportmonksFixture) => String(b.starting_at ?? '').localeCompare(String(a.starting_at ?? ''));

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

async function breakdownFromCache(key: string): Promise<RefereeTeamBreakdown | null> {
  return withRedis((r) => r.get<RefereeTeamBreakdown>(key), null);
}

/** `missing` = böyle bir hakem yok (404); `null` = geçici hata. */
export async function loadRefereePage(id: number): Promise<RefereePageData | 'missing' | null> {
  const [profile, statsRaw, mainIds] = await Promise.all([loadProfile(id), loadRefereeStatsRaw(id), loadMainRefereeFixtureIds(id)]);
  if (profile === 'missing') return 'missing';
  if (!profile) return null;

  const currentIds = new Set(currentSeasonIds(statsRaw));
  const currentSeasonName = (statsRaw?.statistics ?? []).find((s) => s.season?.is_current)?.season?.name ?? null;
  const firstChunk = await loadMulti(mainIds.slice(0, MULTI_SIZE));
  const recent = firstChunk.filter(isFinished).sort(byKickoffDesc).slice(0, RECENT_COUNT).map(toRecentMatch);

  const cacheKey = `${cacheKeyPrefix()}people:ref-teams:v1:${id}:${[...currentIds].sort().join('-') || 'none'}`;
  let teams = await breakdownFromCache(cacheKey);
  if (!teams) {
    const fetched: SportmonksFixture[] = [...firstChunk];
    // Bu sezonun maçları ilk parçaya sığmadıysa (parça dolu ve hepsi bu sezon) sonraki parçalar.
    for (let chunk = 1; chunk < MAX_SEASON_CHUNKS; chunk++) {
      const prev = fetched.slice((chunk - 1) * MULTI_SIZE);
      const passedSeason = prev.some((f) => f.season_id != null && !currentIds.has(f.season_id));
      if (passedSeason || prev.length < MULTI_SIZE || !currentIds.size) break;
      fetched.push(...(await loadMulti(mainIds.slice(chunk * MULTI_SIZE, (chunk + 1) * MULTI_SIZE))));
    }
    const finished = fetched.filter(isFinished);
    const season = finished.filter((f) => f.season_id != null && currentIds.has(f.season_id));
    const scopeFixtures = season.length ? season : finished.sort(byKickoffDesc).slice(0, MULTI_SIZE);
    teams = {
      scope: season.length ? 'season' : 'last',
      seasonName: season.length ? currentSeasonName : null,
      matchCount: scopeFixtures.length,
      rows: refereeTeamBreakdown(scopeFixtures as BreakdownFixture[]),
    };
    if (firstChunk.length) await withRedis((r) => r.set(cacheKey, teams, { ex: BREAKDOWN_TTL_SECONDS }), null);
  }

  return {
    id,
    name: profile.display_name ?? profile.common_name ?? profile.name ?? '',
    country: profile.country?.name ? { name: profile.country.name, ...(profile.country.image_path ? { flag: profile.country.image_path } : {}) } : null,
    seasons: refereeSeasonTable(statsRaw),
    recent,
    teams,
  };
}
