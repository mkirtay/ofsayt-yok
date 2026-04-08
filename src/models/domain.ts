export interface NewsItem {
  id: string;
  title: string;
  url: string;
  source: string;
  publishedAt: string;
  summary?: string;
  image?: string;
}

export interface MatchEvent {
  id: number;
  player: {
    id: number;
    name: string;
  };
  time: number;
  event: string;
  sort: number;
  info: string | null;
  is_home: boolean;
  is_away: boolean;
}

export interface LineupPlayer {
  team_id: string;
  id: string;
  name: string;
  substitution: string; // "0" = starter, "1" = substitute
  shirt_number: string;
  photo?: string;
}

export interface LineupTeam {
  team: {
    id: string;
    name: string;
  };
  players: LineupPlayer[];
}

export interface MatchLineupData {
  lineup: {
    home: LineupTeam;
    away: LineupTeam;
  };
}

export interface MatchStatsData {
  yellow_cards?: string;
  red_cards?: string;
  substitutions?: string | null;
  possesion?: string;
  free_kicks?: string | null;
  goal_kicks?: string | null;
  throw_ins?: string | null;
  offsides?: string | null;
  corners?: string | null;
  shots_on_target?: string | null;
  shots_off_target?: string | null;
  attempts_on_goal?: string | null;
  saves?: string | null;
  fauls?: string | null;
  treatments?: string | null;
  penalties?: string | null;
  shots_blocked?: string | null;
  dangerous_attacks?: string | null;
  attacks?: string | null;
}
