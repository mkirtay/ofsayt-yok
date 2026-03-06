import type {
  LiveScoreApiEventsResponse,
  LiveScoreApiLineupsResponse,
  LiveScoreApiLiveResponse,
  LiveScoreApiStatsResponse,
  LiveScoreMatchDetailResponse,
  LiveScoreMatchResponse,
} from "@/models/liveScore";
import type { Event, Lineup, Match, MatchStat, Team } from "@/models/domain";

const mapLiveStatus = (status: string): Match["status"] => {
  const normalized = status.toLowerCase();
  if (normalized.includes("finished")) {
    return "FT";
  }
  if (normalized.includes("half")) {
    return "HT";
  }
  if (normalized.includes("in play") || normalized.includes("live")) {
    return "1H";
  }
  if (normalized.includes("not started")) {
    return "NS";
  }
  return "NS";
};

const parseScore = (score: string) => {
  const match = score.match(/(\d+)\s*-\s*(\d+)/);
  if (!match) {
    return { home: 0, away: 0 };
  }
  return { home: Number(match[1]), away: Number(match[2]) };
};

export const mapLiveScoreMatches = (
  response: LiveScoreMatchResponse
): Match[] =>
  response.matches.map((match) => ({
    id: String(match.id),
    status: match.status,
    elapsed: match.elapsed,
    league: match.league
      ? {
          country: match.league.country,
          competition: match.league.competition,
          competitionId: match.league.competitionId
            ? String(match.league.competitionId)
            : undefined,
        }
      : undefined,
    homeTeam: {
      id: String(match.home.id),
      name: match.home.name,
      logo: match.home.logo,
    },
    awayTeam: {
      id: String(match.away.id),
      name: match.away.name,
      logo: match.away.logo,
    },
    score: {
      home: match.score.home,
      away: match.score.away,
    },
  }));

export const mapLiveScoreTeams = (response: LiveScoreMatchResponse): Team[] => {
  const teamMap = new Map<string, Team>();

  response.matches.forEach((match) => {
    teamMap.set(String(match.home.id), {
      id: String(match.home.id),
      name: match.home.name,
      logo: match.home.logo,
    });
    teamMap.set(String(match.away.id), {
      id: String(match.away.id),
      name: match.away.name,
      logo: match.away.logo,
    });
  });

  return Array.from(teamMap.values());
};

export const mapLiveScoreMatchDetail = (
  response: LiveScoreMatchDetailResponse
): { events: Event[]; lineups: Lineup[]; stats: MatchStat[] } => ({
  events: response.events.map((event) => ({
    type: event.type,
    minute: event.minute,
    teamId: String(event.teamId),
    playerName: event.player,
  })),
  lineups: response.lineups.map((lineup) => ({
    teamId: String(lineup.teamId),
    formation: lineup.formation,
    startXI: lineup.startXI.map((player) => ({
      name: player.name,
      number: player.number,
    })),
  })),
  stats:
    response.stats?.map((stat) => ({
      label: stat.label,
      home: stat.home,
      away: stat.away,
    })) ?? [],
});

export const mapLiveScoreApiMatches = (
  response: LiveScoreApiLiveResponse
): Match[] =>
  response.data.match.map((match) => {
    const score = parseScore(match.scores?.score ?? "");
    const countryName = match.country?.name ?? "International";
    const competitionName = match.competition?.name ?? "Unknown";
    return {
      id: String(match.id),
      status: mapLiveStatus(match.status),
      elapsed: Number(match.time) || 0,
      league: {
        country: countryName,
        competition: competitionName,
        competitionId: match.competition?.id
          ? String(match.competition.id)
          : undefined,
      },
      homeTeam: {
        id: String(match.home.id),
        name: match.home.name,
        logo: match.home.logo ?? "",
      },
      awayTeam: {
        id: String(match.away.id),
        name: match.away.name,
        logo: match.away.logo ?? "",
      },
      score,
    };
  });

export const mapLiveScoreApiEvents = (
  response: LiveScoreApiEventsResponse
): Event[] =>
  response.data.event
    .map((event) => {
      const isGoal = event.event.includes("GOAL");
      const isCard = event.event.includes("CARD");
      if (!isGoal && !isCard) {
        return null;
      }
      const type = isCard ? "card" : "goal";
      return {
        type,
        minute: event.time ?? 0,
        teamId: event.is_home ? "home" : event.is_away ? "away" : "unknown",
        playerName: event.player?.name ?? "Unknown",
      } satisfies Event;
    })
    .filter((event): event is Event => event !== null);

export const mapLiveScoreApiStats = (
  response: LiveScoreApiStatsResponse
): MatchStat[] => {
  const stats = response.data?.stats ?? [];
  return stats.map((stat) => ({
    label: stat.name,
    home: Number(stat.home) || 0,
    away: Number(stat.away) || 0,
  }));
};

export const mapLiveScoreApiLineups = (
  response: LiveScoreApiLineupsResponse
): Lineup[] => {
  const lineups = response.data?.lineups ?? [];
  return lineups.map((lineup) => ({
    teamId: String(lineup.team_id),
    formation: lineup.formation ?? "",
    startXI:
      lineup.players?.map((player) => ({
        name: player.name,
        number: player.number,
      })) ?? [],
  }));
};
