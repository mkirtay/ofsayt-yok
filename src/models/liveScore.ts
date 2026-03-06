export interface LiveScoreTeam {
  id: number;
  name: string;
  logo: string;
}

export interface LiveScoreMatch {
  id: number;
  status: "NS" | "1H" | "HT" | "2H" | "FT";
  elapsed: number;
  league?: {
    country: string;
    competition: string;
    competitionId?: number;
  };
  home: LiveScoreTeam;
  away: LiveScoreTeam;
  score: {
    home: number;
    away: number;
  };
}

export interface LiveScoreMatchResponse {
  matches: LiveScoreMatch[];
}

export interface LiveScoreEvent {
  type: "goal" | "card";
  minute: number;
  teamId: number;
  player: string;
}

export interface LiveScoreLineup {
  teamId: number;
  formation: string;
  startXI: Array<{
    name: string;
    number: number;
  }>;
}

export interface LiveScoreMatchDetailResponse {
  matchId: number;
  events: LiveScoreEvent[];
  lineups: LiveScoreLineup[];
  stats?: Array<{
    label: string;
    home: number;
    away: number;
  }>;
}

export interface LiveScoreApiLiveResponse {
  success: boolean;
  data: {
    match: Array<{
      country?: {
        name: string;
      } | null;
      competition?: {
        id: number;
        name: string;
      } | null;
      id: number;
      status: string;
      time: string;
      scores: {
        score: string;
      };
      home: {
        id: number;
        name: string;
        logo: string;
      };
      away: {
        id: number;
        name: string;
        logo: string;
      };
    }>;
  };
}

export interface LiveScoreApiEventsResponse {
  success: boolean;
  data: {
    event: Array<{
      id: number;
      time: number;
      event: string;
      is_home: boolean;
      is_away: boolean;
      player: {
        id: number | null;
        name: string | null;
      };
    }>;
  };
}

export interface LiveScoreApiStatsResponse {
  success: boolean;
  data?: {
    stats?: Array<{
      name: string;
      home: number | string;
      away: number | string;
    }>;
  };
}

export interface LiveScoreApiLineupsResponse {
  success: boolean;
  data?: {
    lineups?: Array<{
      team_id: number;
      formation: string;
      players: Array<{
        name: string;
        number: number;
      }>;
    }>;
  };
}
