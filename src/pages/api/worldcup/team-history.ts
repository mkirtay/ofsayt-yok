import type { NextApiRequest, NextApiResponse } from 'next';
import { runWithLiveScoreHttpClient, getLiveScoreHttpClient } from '@/services/liveScoreHttpContext';
import {
  getSeasonsList,
} from '@/services/liveScoreService';
import { pickWorldCupSeasonsFromApi, WORLD_CUP_COMPETITION_ID } from '@/config/worldCup';
import type { Match } from '@/models/liveScore';
import axios from 'axios';

const WORLD_CUP_ID = String(WORLD_CUP_COMPETITION_ID);
const MAX_SEASONS = 4;

function getBestRound(matches: Match[]): string {
  const rank: Record<string, number> = {
    Final: 6, SF: 5, QF: 4, R16: 3, R32: 2, 'Group Stage': 1,
  };
  let best = 'Group Stage';
  for (const m of matches) {
    const r = (m.round ?? '').trim().toUpperCase().replace(/\s+/g, '');
    let label = 'Group Stage';
    if (r === 'F' || r === 'FINAL') label = 'Final';
    else if (r === '1/2' || r === 'SF') label = 'SF';
    else if (r === '1/4' || r === 'QF') label = 'QF';
    else if (r === '1/8' || r === 'R16') label = 'R16';
    else if (r === '1/16' || r === 'R32') label = 'R32';
    if ((rank[label] ?? 0) > (rank[best] ?? 0)) best = label;
  }
  return best;
}

async function fetchTeamMatchesInSeason(
  teamId: number,
  seasonId: number,
): Promise<Match[]> {
  const client = getLiveScoreHttpClient();
  try {
    const res = await client.get<{ success?: boolean; data?: { match?: Match[] } }>('/matches/history', {
      params: { competition_id: WORLD_CUP_ID, team_id: teamId, season_id: seasonId, page: 1 },
    });
    if (res.data.success && Array.isArray(res.data.data?.match)) {
      return res.data.data.match;
    }
  } catch {
    // season may not exist for this competition_id
  }
  return [];
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).end();
  }

  const teamIdRaw = req.query.team_id;
  const teamId = Number(Array.isArray(teamIdRaw) ? teamIdRaw[0] : teamIdRaw);
  if (!Number.isInteger(teamId) || teamId <= 0) {
    return res.status(400).json({ error: 'Geçersiz team_id.' });
  }

  try {
    const xfProto = req.headers['x-forwarded-proto'];
    const proto = Array.isArray(xfProto) ? xfProto[0] : xfProto || 'http';
    const host = req.headers.host || 'localhost:3000';
    const client = axios.create({ baseURL: `${proto}://${host}/api/livescore`, timeout: 25_000 });

    const seasons = await runWithLiveScoreHttpClient(client, async () => {
      const all = await getSeasonsList({ skipCalendarYearDedupe: true });
      return pickWorldCupSeasonsFromApi(all);
    });

    const pastSeasons = seasons.filter((s) => s.name.trim() !== '2026').slice(0, MAX_SEASONS);

    const results = await runWithLiveScoreHttpClient(client, async () =>
      Promise.all(
        pastSeasons.map(async (season) => {
          const matches = await fetchTeamMatchesInSeason(teamId, season.id);
          return {
            year: season.name.trim(),
            seasonId: season.id,
            matches: matches.map((m) => ({
              id: m.id,
              date: m.date,
              homeId: m.home?.id,
              homeName: m.home?.name ?? '?',
              homeLogo: m.home?.logo,
              awayId: m.away?.id,
              awayName: m.away?.name ?? '?',
              awayLogo: m.away?.logo,
              score: m.scores?.ft_score || m.scores?.score || m.score,
              round: m.round,
              status: m.status,
            })),
            bestRound: getBestRound(matches),
          };
        })
      )
    );

    const filtered = results.filter((s) => s.matches.length > 0);

    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    return res.status(200).json({ seasons: filtered });
  } catch (e) {
    console.error('[worldcup/team-history]', e);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}
