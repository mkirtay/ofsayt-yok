import {
  getTeamsHead2Head,
  getTeamLastMatches,
  type Head2HeadData,
} from '@/services/liveScoreService';
import {
  buildH2HContext,
  buildRecentMatchRow,
  computeMetrics,
  type H2HContext,
  type RecentMatchRow,
  type TeamMetrics,
} from '@/server/buildMatchAnalysisContext';
import { runSsrLiveScoreLoad } from './runSsrLiveScoreLoad';

export type TeamCompareData = {
  teamId: number;
  teamName: string;
  teamLogo?: string;
  recentMatches: RecentMatchRow[];
  metrics: TeamMetrics;
};

export type ComparePagePayload = {
  team1Id: number;
  team2Id: number;
  team1: TeamCompareData;
  team2: TeamCompareData;
  h2h: H2HContext | null;
  h2hRaw: Head2HeadData | null;
};

export function parseCompareSlug(slug: string): { team1Id: number; team2Id: number } | null {
  const m = /^(\d+)-vs-(\d+)$/.exec(slug);
  if (!m) return null;
  const t1 = Number(m[1]);
  const t2 = Number(m[2]);
  if (!Number.isFinite(t1) || !Number.isFinite(t2) || t1 === t2) return null;
  return { team1Id: t1, team2Id: t2 };
}

export async function loadComparePageData(
  team1Id: number,
  team2Id: number
): Promise<ComparePagePayload | null> {
  return runSsrLiveScoreLoad(`compare:${team1Id}-vs-${team2Id}`, async () => {
  const [h2hData, team1Matches, team2Matches] = await Promise.all([
        getTeamsHead2Head(String(team1Id), String(team2Id)).catch(() => null),
        getTeamLastMatches(String(team1Id), 10).catch(() => []),
        getTeamLastMatches(String(team2Id), 10).catch(() => []),
      ]);

  const team1Rows = team1Matches
    .map((m) => buildRecentMatchRow(m, team1Id))
    .filter((r): r is RecentMatchRow => r != null);

  const team2Rows = team2Matches
    .map((m) => buildRecentMatchRow(m, team2Id))
    .filter((r): r is RecentMatchRow => r != null);

  // Extract team names and logos from match data
  function teamMeta(
    matches: typeof team1Matches,
    teamId: number
  ): { name: string; logo?: string } {
    for (const m of matches) {
      if ((m.home?.id ?? m.home_id) === teamId && m.home?.name) {
        return { name: m.home.name, logo: m.home.logo };
      }
      if ((m.away?.id ?? m.away_id) === teamId && m.away?.name) {
        return { name: m.away.name, logo: m.away.logo };
      }
    }
    // Fallback: check h2h data
    if (h2hData) {
      const t = String(teamId);
      if (h2hData.team1?.id === t) return { name: h2hData.team1.name };
      if (h2hData.team2?.id === t) return { name: h2hData.team2.name };
    }
    return { name: `Takım #${teamId}` };
  }

  const meta1 = teamMeta(team1Matches, team1Id);
  const meta2 = teamMeta(team2Matches, team2Id);

  if (!meta1.name && !meta2.name && !h2hData) return null;

  const h2h = buildH2HContext(h2hData, meta1.name);

  return {
    team1Id,
    team2Id,
    team1: {
      teamId: team1Id,
      teamName: meta1.name,
      teamLogo: meta1.logo,
      recentMatches: team1Rows,
      metrics: computeMetrics(team1Rows),
    },
    team2: {
      teamId: team2Id,
      teamName: meta2.name,
      teamLogo: meta2.logo,
      recentMatches: team2Rows,
      metrics: computeMetrics(team2Rows),
    },
    h2h,
    h2hRaw: h2hData,
  };
  });
}
