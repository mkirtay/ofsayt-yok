import {
  fetchTeamLastMatches,
  getTeamsHead2Head,
  getTeamTopScorers,
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
import { pickCurrentSeasonId, summarizeH2H, type H2HSummary } from '@/utils/compareData';
import type { TeamTopScorer } from '@/services/sportmonksKatman2Mapper';
import { timedSsrLoad } from './ssrTiming';

export type TeamCompareData = {
  teamId: number;
  teamName: string;
  teamLogo?: string;
  recentMatches: RecentMatchRow[];
  metrics: TeamMetrics;
  /** Güncel (lig) sezonun en golcüleri (en çok 3, çoktan aza); veri yoksa boş. */
  topScorers: TeamTopScorer[];
};

export type ComparePagePayload = {
  team1Id: number;
  team2Id: number;
  team1: TeamCompareData;
  team2: TeamCompareData;
  h2h: H2HContext | null;
  h2hRaw: Head2HeadData | null;
  /** Son 10 karşılaşma özeti (team1/team2 perspektifi). */
  h2hSummary: H2HSummary;
  /**
   * Yüklenemeyen bölümler (sağlayıcı hatası / zaman aşımı — "veri yok" DEĞİL). Varsa API yanıtı CDN'de kısa tutulur,
   * sayfa o bölümde "yüklenemedi · tekrar dene" gösterir. Yalnız en az biri hatalıyken alan var.
   */
  failed?: CompareFailedSections;
};

export type CompareFailedSections = { h2h?: true; team1Recent?: true; team2Recent?: true };

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
  return timedSsrLoad(`compare:${team1Id}-vs-${team2Id}`, async () => {
  // Hata ≠ veri yok: her bölümün hatası ayrı işaretlenir (boş karşılaşma geçmişi / maçsız takım gerçek içeriktir).
  const [h2hRes, team1Res, team2Res] = await Promise.allSettled([
    getTeamsHead2Head(String(team1Id), String(team2Id)),
    fetchTeamLastMatches(String(team1Id), 10),
    fetchTeamLastMatches(String(team2Id), 10),
  ]);
  // Hiçbiri alınamadıysa sayfa "Takım #id" adlı boş kopya olmasın: hata (API 500, istemci yeniden dener).
  if (h2hRes.status === 'rejected' && team1Res.status === 'rejected' && team2Res.status === 'rejected') {
    throw h2hRes.reason;
  }
  const h2hData = h2hRes.status === 'fulfilled' ? h2hRes.value : null;
  const team1Matches = team1Res.status === 'fulfilled' ? team1Res.value : [];
  const team2Matches = team2Res.status === 'fulfilled' ? team2Res.value : [];
  const failed: CompareFailedSections = {
    ...(h2hRes.status === 'rejected' ? { h2h: true as const } : {}),
    ...(team1Res.status === 'rejected' ? { team1Recent: true as const } : {}),
    ...(team2Res.status === 'rejected' ? { team2Recent: true as const } : {}),
  };

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
  const h2hSummary = summarizeH2H(h2hData?.h2h, meta1.name, meta2.name);

  // En golcüler: takım başına 1 istek (kadro istatistiği, sunucuda cache'li); sezon son maçlardan türetilir.
  const [topScorers1, topScorers2] = await Promise.all(
    [team1Matches, team2Matches].map(async (ms, i) => {
      const seasonId = pickCurrentSeasonId(ms);
      return seasonId == null ? [] : getTeamTopScorers(seasonId, i === 0 ? team1Id : team2Id);
    }),
  );

  return {
    team1Id,
    team2Id,
    team1: {
      teamId: team1Id,
      teamName: meta1.name,
      teamLogo: meta1.logo,
      recentMatches: team1Rows,
      metrics: computeMetrics(team1Rows),
      topScorers: topScorers1,
    },
    team2: {
      teamId: team2Id,
      teamName: meta2.name,
      teamLogo: meta2.logo,
      recentMatches: team2Rows,
      metrics: computeMetrics(team2Rows),
      topScorers: topScorers2,
    },
    h2h,
    h2hRaw: h2hData,
    h2hSummary,
    ...(Object.keys(failed).length ? { failed } : {}),
  };
  });
}
