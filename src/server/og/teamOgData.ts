/**
 * Takım paylaşım görselinin verisi — takım sayfasının önbellekli Sportmonks istekleriyle (aynı önbellek anahtarları):
 * `teams/{id}` (genel bakış: ad, logo, son maçlar → form ve varsayılan turnuva) ve o turnuvanın puan durumu.
 * Servisler yalnız kullanılır; davranışları değişmez.
 */
import { getTeamOverview } from '@/services/teamPage';
import { getCompetitionStandings } from '@/services/competitionStandings';
import { toStandingsCompetitionId } from '@/services/sportmonksProviderFlag';
import { defaultCompetitionId, teamForm, type FormResult } from '@/services/sportmonks/teamOverview';
import { SportmonksHttpError } from '@/services/sportmonks/httpClient';
import type { CompetitionTableData, CompetitionTableStandingRow } from '@/services/liveScoreService';
import { leagueDisplayName } from '@/lib/gundem/bot/leagueNames';

export type TeamOgData = {
  team: { id: number; name: string; logo?: string };
  competition: { id: number; name: string; logo?: string } | null;
  standing: { rank: number; points: number } | null;
  /** Son 5 sonuçlanmış maç, eskiden yeniye (en yenisi sağda). */
  form: FormResult[];
};

const MISSING_STATUSES = new Set([400, 403, 404, 422]);

function findStanding(table: CompetitionTableData | null, teamId: string): CompetitionTableStandingRow | null {
  if (!table) return null;
  const rows = [...(table.table ?? []), ...(table.stages ?? []).flatMap((s) => (s.groups ?? []).flatMap((g) => g.standings ?? []))];
  return rows.find((r) => String(r.team?.id ?? r.team_id) === teamId) ?? null;
}

/** Takım yoksa (Sportmonks "yok") null; geçici hata fırlatır. */
export async function loadTeamOgData(teamId: string): Promise<TeamOgData | null> {
  let overview;
  try {
    overview = await getTeamOverview(teamId);
  } catch (err) {
    if (err instanceof SportmonksHttpError && MISSING_STATUSES.has(err.status)) return null;
    throw err;
  }
  if (!overview.team?.name) return null;

  const form = teamForm(overview.recent, teamId, 5)
    .map((f) => f.result)
    .reverse();

  const compId = defaultCompetitionId(overview.recent, overview.fixtures);
  const compMatch = compId == null ? undefined : [...overview.recent, ...overview.fixtures].find((m) => m.competition?.id === compId);
  const competition = compMatch?.competition
    ? {
        id: compMatch.competition.id,
        name: leagueDisplayName(compMatch.competition.id, compMatch.competition.name) ?? compMatch.competition.name,
        ...(compMatch.competition.logo ? { logo: compMatch.competition.logo } : {}),
      }
    : null;

  let standing: TeamOgData['standing'] = null;
  const standingsId = compId != null ? toStandingsCompetitionId(compId) : null;
  if (standingsId != null) {
    const row = findStanding(await getCompetitionStandings(String(standingsId)), teamId);
    if (row && Number.isFinite(Number(row.rank))) standing = { rank: Number(row.rank), points: Number(row.points) };
  }

  return { team: overview.team, competition, standing, form };
}
