/**
 * Teknik direktör sayfası (/teknik-direktor/[slug]) verisi — sunucuda (ISR), Sportmonks paylaşımlı cache'ten:
 * - profil `coaches/{id}?include=nationality;teams.team` (7 gün) — mevcut takım + göreve başlama,
 * - sezon istatistikleri (12 sa) — sezon × turnuva × takım G-B-M,
 * - son 10 maç: mevcut takımın maçlarından (takım sayfasıyla ortak cache), göreve başladığı tarihten sonra.
 * Kariyer zaman çizelgesi yok (Sportmonks `teams` kaydı eksik).
 */
import { sportmonksClientRequest } from '@/services/sportmonksRuntimeClient';
import { getTeamHistoryMatches } from '@/services/liveScoreService';
import { coachSeasonTable, ageOn, type CoachSeasonRow, type RawCoach } from '@/services/sportmonks/coachStats';
import { todayIsoIstanbul } from '@/utils/dateStrip';
import type { PersonRecentMatch } from '@/server/people/refereePage';

const RECENT_COUNT = 10;
export const COACH_STATS_INCLUDE = 'statistics.details.type:developer_name;statistics.season:name,league_id;statistics.team:name,image_path';

type RawCoachProfile = {
  id?: number;
  display_name?: string;
  common_name?: string;
  name?: string;
  image_path?: string | null;
  date_of_birth?: string | null;
  nationality?: { name?: string; image_path?: string | null } | null;
  teams?: { team_id?: number; start?: string | null; end?: string | null; team?: { name?: string; image_path?: string | null } | null }[] | null;
};

export type CoachPageData = {
  id: number;
  name: string;
  photo?: string;
  age: number | null;
  nationality: { name: string; flag?: string } | null;
  currentTeam: { id: number; name: string; logo?: string; since: string | null } | null;
  seasons: CoachSeasonRow[];
  recent: PersonRecentMatch[];
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

async function loadProfile(id: number): Promise<RawCoachProfile | 'missing' | null> {
  try {
    const env = await sportmonksClientRequest<RawCoachProfile>('football', `/coaches/${id}`, { include: 'nationality;teams.team:name,image_path' });
    return env.data && !Array.isArray(env.data) && env.data.id ? env.data : 'missing';
  } catch (e) {
    return (e as { status?: number })?.status === 404 ? 'missing' : null;
  }
}

async function loadStats(id: number): Promise<RawCoach | null> {
  try {
    const env = await sportmonksClientRequest<RawCoach>('football', `/coaches/${id}`, { include: COACH_STATS_INCLUDE });
    return env.data && !Array.isArray(env.data) ? env.data : null;
  } catch {
    return null;
  }
}

export async function loadCoachPage(id: number): Promise<CoachPageData | 'missing' | null> {
  const today = todayIsoIstanbul();
  const [profile, stats] = await Promise.all([loadProfile(id), loadStats(id)]);
  if (profile === 'missing') return 'missing';
  if (!profile) return null;
  const stint = currentTeamStint(profile.teams, today);
  const recent = stint
    ? (await getTeamHistoryMatches(String(stint.teamId)))
        .filter((m) => m.status === 'FINISHED' && (!stint.since || (m.date ?? '') >= stint.since))
        .slice(0, RECENT_COUNT)
        .map(
          (m): PersonRecentMatch => ({
            id: m.id,
            status: m.status,
            home: m.home,
            away: m.away,
            ...(m.date ? { date: m.date } : {}),
            ...(m.scheduled ? { scheduled: m.scheduled } : {}),
            ...(m.scores ? { scores: m.scores } : {}),
            ...(m.competition ? { competition: m.competition } : {}),
          }),
        )
    : [];
  return {
    id,
    name: profile.display_name ?? profile.common_name ?? profile.name ?? '',
    ...(!isPlaceholder(profile.image_path) ? { photo: profile.image_path! } : {}),
    age: ageOn(profile.date_of_birth, today),
    nationality: profile.nationality?.name ? { name: profile.nationality.name, ...(profile.nationality.image_path ? { flag: profile.nationality.image_path } : {}) } : null,
    currentTeam: stint ? { id: stint.teamId, name: stint.name, since: stint.since, ...(stint.logo ? { logo: stint.logo } : {}) } : null,
    seasons: coachSeasonTable(stats),
    recent,
  };
}
