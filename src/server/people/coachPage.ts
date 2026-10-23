/**
 * Teknik direktör sayfası (/teknik-direktor/[slug]) verisi — sunucuda (ISR), Sportmonks paylaşımlı cache'ten TEK istek:
 * `coaches/{id}?include=` profil (nationality; teams.team) + sezon istatistikleri + görev aldığı maçlar
 * (`COACH_PAGE_INCLUDE`, ~50 KB). Önce üç ayrı `coaches/{id}` isteğiydi (Coach havuzu, tarayıcı dalgasında 3×).
 * - profil — mevcut takım + göreve başlama,
 * - sezon istatistikleri — sezon × turnuva × takım G-B-M,
 * - son 10 maç: görev aldığı biten maçlar → skor / takım / lig `fixtures/multi` ile.
 * Kariyer zaman çizelgesi yok (Sportmonks `teams` kaydı eksik).
 */
import { sportmonksClientRequest } from '@/services/sportmonksRuntimeClient';
import { loadMulti, isFinished, byKickoffDesc, toRecentMatch } from '@/server/people/refereePage';
import { mapSportmonksStateToPhase } from '@/services/sportmonks/stateMapping';
import { coachSeasonTable, ageOn, type CoachSeasonRow, type RawCoach } from '@/services/sportmonks/coachStats';
import { todayIsoIstanbul } from '@/utils/dateStrip';
import { cacheKeyPrefix } from '@/lib/cacheNamespace';
import { loadWithSwr } from '@/server/swrCache';
import type { PersonRecentMatch } from '@/server/people/refereePage';

type RawCoachFixtures = { fixtures?: { id: number; starting_at?: string | null; state_id?: number | null }[] | null };

const RECENT_COUNT = 10;
/** "Daha fazla" sayfa sınırı: görev aldığı biten en fazla 100 maç (kota: sayfa başı bir `fixtures/multi`). */
const MAX_MATCH_PAGES = 10;
export const COACH_PAGE_FRESH_SECONDS = 6 * 60 * 60;
export const COACH_STATS_INCLUDE = 'statistics.details.type:developer_name;statistics.season:name,league_id;statistics.team:name,image_path';
/** Sayfanın tek isteği (2026-10-14 gerçek istekle doğrulandı: dört include birlikte eksiksiz dönüyor). */
export const COACH_PAGE_INCLUDE = `nationality;teams.team:name,image_path;${COACH_STATS_INCLUDE};fixtures:starting_at,state_id`;

type RawCoachProfile = {
  id?: number;
  display_name?: string;
  common_name?: string;
  name?: string;
  image_path?: string | null;
  date_of_birth?: string | null;
  nationality?: { name?: string; iso2?: string | null; image_path?: string | null } | null;
  teams?: { team_id?: number; start?: string | null; end?: string | null; team?: { name?: string; image_path?: string | null } | null }[] | null;
};

export type CoachPageData = {
  id: number;
  name: string;
  photo?: string;
  age: number | null;
  /** `name` Sportmonks (İngilizce); görünen ad `countryDisplayName` ile. */
  nationality: { name: string; iso2?: string; flag?: string } | null;
  currentTeam: { id: number; name: string; logo?: string; since: string | null } | null;
  seasons: CoachSeasonRow[];
  recent: PersonRecentMatch[];
  /** İlk 10'dan sonra gösterilebilecek daha eski biten maç var mı ("Daha fazla" düğmesi). */
  hasMoreMatches?: boolean;
};

const isPlaceholder = (url?: string | null) => !url || /placeholder/i.test(url);

/** Görevdeki takım: bitişi olmayan / bugünden sonra biten en son kayıt; aynı takımdaki kesintisiz kayıtlar birleşir. */
export function currentTeamStint(teams: RawCoachProfile['teams'], today: string): { teamId: number; since: string | null; name: string; logo?: string } | null {
  const rows = (teams ?? []).filter((t) => t.team_id != null).sort((a, b) => String(a.start ?? '').localeCompare(String(b.start ?? '')));
  const cur = [...rows].reverse().find((t) => !t.end || t.end >= today);
  if (!cur) return null;
  let since = cur.start ?? null;
  for (let i = rows.indexOf(cur) - 1; i >= 0; i--) {
    const r = rows[i]!;
    if (r.team_id !== cur.team_id || !r.end || !since) break;
    const gapDays = (Date.parse(since) - Date.parse(r.end)) / 86_400_000;
    if (gapDays > 3) break;
    since = r.start ?? since;
  }
  return { teamId: cur.team_id!, since, name: cur.team?.name ?? '', ...(cur.team?.image_path ? { logo: cur.team.image_path } : {}) };
}

type RawCoachPage = RawCoachProfile & RawCoach & RawCoachFixtures;

/** `missing`: Sportmonks 404 / boş; `null`: geçici hata. */
async function loadCoach(id: number): Promise<RawCoachPage | 'missing' | null> {
  try {
    const env = await sportmonksClientRequest<RawCoachPage>('football', `/coaches/${id}`, { include: COACH_PAGE_INCLUDE });
    return env.data && !Array.isArray(env.data) && env.data.id ? env.data : 'missing';
  } catch (e) {
    return (e as { status?: number })?.status === 404 ? 'missing' : null;
  }
}

/** Görev aldığı biten maçların id'leri, en yeniden eskiye. */
function finishedIdsDesc(fixtures: RawCoachFixtures['fixtures']): number[] {
  return (fixtures ?? [])
    .filter((f) => f.state_id != null && mapSportmonksStateToPhase(f.state_id) === 'FINISHED')
    .sort(byKickoffDesc)
    .map((f) => f.id);
}

/** Son maçlar: görev aldığı biten maçlardan `page`. sayfa (0 = son 10) → skor / takım / lig `fixtures/multi` ile (hakem sayfasıyla aynı include, cache'li). */
async function loadRecent(fixtures: RawCoachFixtures['fixtures'], page = 0): Promise<PersonRecentMatch[]> {
  try {
    const ids = finishedIdsDesc(fixtures).slice(page * RECENT_COUNT, (page + 1) * RECENT_COUNT);
    return (await loadMulti(ids)).filter(isFinished).sort(byKickoffDesc).map(toRecentMatch);
  } catch {
    return [];
  }
}

/**
 * "Daha fazla" için: `page` (1…) sayfasındaki eski maçlar. `missing`: teknik direktör yok / sayfa aralık dışı;
 * `null`: geçici hata (istemci "yüklenemedi · tekrar dene" der, "maç yok" DEMEZ).
 */
export async function loadCoachMatchesPage(id: number, page: number): Promise<{ matches: PersonRecentMatch[]; hasMore: boolean } | 'missing' | null> {
  if (!Number.isInteger(page) || page < 1 || page >= MAX_MATCH_PAGES) return 'missing';
  const profile = await loadCoach(id);
  if (profile === 'missing') return 'missing';
  if (!profile) return null;
  const all = finishedIdsDesc(profile.fixtures);
  const ids = all.slice(page * RECENT_COUNT, (page + 1) * RECENT_COUNT);
  if (!ids.length) return 'missing';
  const matches = (await loadMulti(ids)).filter(isFinished).sort(byKickoffDesc).map(toRecentMatch);
  if (!matches.length) return null;
  return { matches, hasMore: all.length > (page + 1) * RECENT_COUNT && page + 1 < MAX_MATCH_PAGES };
}

/**
 * Sayfa verisi Redis'te stale-while-revalidate (taze 6 sa, saklama 7 gün): süresi dolunca eski veri hemen, yenisi
 * arka planda (bkz. server/swrCache.ts); "yok" (404) cache'lenmez. Hiç veri yokken ilk üretim eşzamanlı.
 * 6 sa: teknik direktör haftada ~1 maç yapar; tarayıcılar çok sayıda sayfayı gezerken her saat yeniden üretim
 * (Fixture havuzundan `fixtures/multi`) havuzu boşuna tüketiyordu.
 */
export async function loadCoachPage(id: number): Promise<CoachPageData | 'missing' | null> {
  let missing = false;
  const res = await loadWithSwr<CoachPageData>(`${cacheKeyPrefix()}people:coach-page:v1:${id}`, { freshSeconds: COACH_PAGE_FRESH_SECONDS }, async () => {
    const r = await computeCoachPage(id);
    if (r === 'missing') missing = true;
    return r === 'missing' ? null : r;
  });
  if (res) return res.value;
  return missing ? 'missing' : null;
}

export async function computeCoachPage(id: number): Promise<CoachPageData | 'missing' | null> {
  const today = todayIsoIstanbul();
  const profile = await loadCoach(id);
  if (profile === 'missing') return 'missing';
  if (!profile) return null;
  const recent = await loadRecent(profile.fixtures);
  const stint = currentTeamStint(profile.teams, today);
  return {
    id,
    name: profile.display_name ?? profile.common_name ?? profile.name ?? '',
    ...(!isPlaceholder(profile.image_path) ? { photo: profile.image_path! } : {}),
    age: ageOn(profile.date_of_birth, today),
    nationality: profile.nationality?.name
      ? {
          name: profile.nationality.name,
          ...(profile.nationality.iso2 ? { iso2: profile.nationality.iso2 } : {}),
          ...(profile.nationality.image_path ? { flag: profile.nationality.image_path } : {}),
        }
      : null,
    currentTeam: stint ? { id: stint.teamId, name: stint.name, since: stint.since, ...(stint.logo ? { logo: stint.logo } : {}) } : null,
    seasons: coachSeasonTable(profile),
    recent,
    ...(finishedIdsDesc(profile.fixtures).length > RECENT_COUNT ? { hasMoreMatches: true } : {}),
  };
}
