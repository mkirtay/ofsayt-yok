import type { Match, Team } from "@/models/domain";
import {
  mapLiveScoreApiEvents,
  mapLiveScoreApiLineups,
  mapLiveScoreApiMatches,
  mapLiveScoreApiStats,
  mapLiveScoreMatchDetail,
  mapLiveScoreMatches,
  mapLiveScoreTeams,
} from "@/services/adapters/liveScoreAdapter";
import {
  liveScoreMatchDetailMock,
  liveScoreMatchesMock,
} from "@/services/mock/liveScoreMock";

export const getLiveMatchesMock = () => mapLiveScoreMatches(liveScoreMatchesMock);

export const getTeamsFromMatchesMock = () =>
  mapLiveScoreTeams(liveScoreMatchesMock);

export const getTeamsFromMatchesData = (matches: Match[]): Team[] => {
  const teamMap = new Map<string, Team>();
  matches.forEach((match) => {
    teamMap.set(match.homeTeam.id, match.homeTeam);
    teamMap.set(match.awayTeam.id, match.awayTeam);
  });
  return Array.from(teamMap.values());
};

export const getMatchDetailMock = (matchId: string) => {
  const detail = liveScoreMatchDetailMock[Number(matchId)];
  if (!detail) {
    return {
      events: [],
      lineups: [],
      stats: [],
    };
  }

  return mapLiveScoreMatchDetail(detail);
};

export const getLiveMatches = async () => {
  try {
    const response = await fetch("/api/livescore/live");
    if (!response.ok) {
      throw new Error("Failed to fetch live matches");
    }
    const data = await response.json();
    if (!data.success) {
      throw new Error(data.error ?? "API error");
    }
    return mapLiveScoreApiMatches(data);
  } catch {
    return getLiveMatchesMock();
  }
};

export const getTeamsFromMatches = async () => {
  const matches = await getLiveMatches();
  return getTeamsFromMatchesData(matches);
};

export const getMatchDetail = async (matchId: string) => {
  try {
    const [eventsResponse, lineupsResponse, statsResponse] = await Promise.all([
      fetch(`/api/livescore/events?id=${encodeURIComponent(matchId)}`),
      fetch(`/api/livescore/lineups?match_id=${encodeURIComponent(matchId)}`),
      fetch(`/api/livescore/stats?match_id=${encodeURIComponent(matchId)}`),
    ]);

    const [eventsData, lineupsData, statsData] = await Promise.all([
      eventsResponse.json(),
      lineupsResponse.json(),
      statsResponse.json(),
    ]);

    return {
      events: eventsData.success ? mapLiveScoreApiEvents(eventsData) : [],
      lineups: lineupsData.success ? mapLiveScoreApiLineups(lineupsData) : [],
      stats: statsData.success ? mapLiveScoreApiStats(statsData) : [],
    };
  } catch {
    return getMatchDetailMock(matchId);
  }
};
