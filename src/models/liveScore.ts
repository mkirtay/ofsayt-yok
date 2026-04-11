export interface Team {
  id: number;
  name: string;
  logo?: string;
  stadium?: string;
  country_id?: number;
}

export interface MatchScore {
  score: string;
  ht_score?: string;
  ft_score?: string;
  et_score?: string;
  ps_score?: string;
}

export interface Competition {
  id: number;
  name: string;
  is_league?: boolean;
  is_cup?: boolean;
  tier?: number;
  logo?: string;
}

export interface MatchCountry {
  id: number;
  name: string;
  flag?: string;
  fifa_code?: string;
}

export interface MatchUrls {
  head2head?: string;
  events?: string;
  statistics?: string;
  lineups?: string;
}

export interface Match {
  id: number;
  status: string;
  time: string;
  date?: string;
  scheduled?: string;
  location?: string;
  home: Team;
  away: Team;
  scores?: MatchScore;
  score?: string; // Sometimes APIs return flat structure for history or others
  country?: MatchCountry;
  competition?: Competition;
  competition_id?: number;
  competition_name?: string;
  home_name?: string;
  away_name?: string;
  home_id?: number;
  away_id?: number;
  fixture_id?: number;
  added?: string;
  urls?: MatchUrls;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
}

export interface LiveMatchData {
  match: Match[];
  total_pages?: number;
}

export interface FixtureData {
  fixtures: Match[];
}

/** `fixtures/list.json` satırı — `Match` ile birebir değil */
export interface FixtureListItem {
  id: number;
  time?: string;
  date?: string;
  group_id?: number;
  competition?: Competition;
  home?: Team;
  away?: Team;
  country?: MatchCountry;
  location?: string;
  round?: string;
}
