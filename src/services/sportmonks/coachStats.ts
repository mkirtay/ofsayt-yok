/**
 * Teknik direktör sezon tablosu — `GET /coaches/{id}?include=statistics.details.type;statistics.season;statistics.team`
 * (2026-10-04 doğrulandı, O. Buruk: 14 kayıt, sezon × lig × takım). WIN / DRAW / LOST türü yoksa o sonuç 0 demek
 * (ör. yalnız LOST gelen kayıt). Yalnız planımızın kapsadığı turnuvalar gelir (eski sezonlarda iç lig eksik olabilir).
 */
export type CoachSeasonRow = {
  seasonId: number;
  seasonName: string;
  leagueId: number | null;
  teamId: number | null;
  teamName: string;
  teamLogo?: string;
  matches: number;
  wins: number;
  draws: number;
  losses: number;
  /** 0–100, tam sayı; maç yoksa null */
  winPct: number | null;
};

type RawDetail = { value?: unknown; type?: { developer_name?: string } | null };
type RawCoachStat = {
  season_id?: number;
  team_id?: number;
  season?: { name?: string; league_id?: number } | null;
  team?: { name?: string; image_path?: string | null } | null;
  details?: RawDetail[] | null;
};
export type RawCoach = { id?: number; statistics?: RawCoachStat[] | null };

const count = (details: RawDetail[] | null | undefined, key: string): number => {
  const v = details?.find((d) => d.type?.developer_name === key)?.value as { count?: unknown } | undefined;
  return typeof v?.count === 'number' && Number.isFinite(v.count) ? v.count : 0;
};

export function coachSeasonTable(raw: RawCoach | null | undefined): CoachSeasonRow[] {
  return (raw?.statistics ?? [])
    .map((s): CoachSeasonRow => {
      const wins = count(s.details, 'WIN');
      const draws = count(s.details, 'DRAW');
      const losses = count(s.details, 'LOST');
      const matches = count(s.details, 'MATCHES') || wins + draws + losses;
      return {
        seasonId: s.season_id ?? 0,
        seasonName: s.season?.name ?? '',
        leagueId: s.season?.league_id ?? null,
        teamId: s.team_id ?? null,
        teamName: s.team?.name ?? '',
        ...(s.team?.image_path ? { teamLogo: s.team.image_path } : {}),
        matches,
        wins,
        draws,
        losses,
        winPct: matches > 0 ? Math.round((wins / matches) * 100) : null,
      };
    })
    .filter((r) => r.matches > 0)
    .sort((a, b) => b.seasonName.localeCompare(a.seasonName) || (a.leagueId ?? 0) - (b.leagueId ?? 0));
}

/** Yaş (tam yıl) — `YYYY-MM-DD`; bilinmiyorsa null. */
export function ageOn(dateOfBirth: string | null | undefined, today: string): number | null {
  if (!dateOfBirth || !/^\d{4}-\d{2}-\d{2}/.test(dateOfBirth)) return null;
  const [y, m, d] = dateOfBirth.slice(0, 10).split('-').map(Number) as [number, number, number];
  const [ty, tm, td] = today.slice(0, 10).split('-').map(Number) as [number, number, number];
  return ty - y - (tm < m || (tm === m && td < d) ? 1 : 0);
}
