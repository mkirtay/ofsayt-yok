export type MatchStatus = "NS" | "1H" | "HT" | "2H" | "FT";

export interface Team {
  id: string;
  name: string;
  logo: string;
}

export interface MatchScore {
  home: number;
  away: number;
}

export interface MatchLeague {
  country: string;
  competition: string;
  competitionId?: string;
}

export interface Match {
  id: string;
  status: MatchStatus;
  elapsed: number;
  league?: MatchLeague;
  homeTeam: Team;
  awayTeam: Team;
  score: MatchScore;
}

export interface Event {
  type: "goal" | "card";
  minute: number;
  teamId: string;
  playerName: string;
}

export interface LineupPlayer {
  name: string;
  number: number;
}

export interface Lineup {
  teamId: string;
  formation: string;
  startXI: LineupPlayer[];
}

export interface MatchStat {
  label: string;
  home: number;
  away: number;
}
