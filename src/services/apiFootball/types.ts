/** API-Football v3 `fixtures?id=` cevabının kullandığımız (gevşek) şekli. Kaynak: __fixtures__/fixture*.json */
export type AfTeamRef = { id: number; name: string; logo?: string | null; winner?: boolean | null };
export type AfGoals = { home: number | null; away: number | null };

export type AfEvent = {
  time: { elapsed: number | null; extra: number | null };
  team: { id: number; name?: string };
  player: { id: number | null; name: string | null };
  assist: { id: number | null; name: string | null };
  type: string;
  detail: string;
  comments?: string | null;
};

export type AfLineupPlayer = {
  player: { id: number | null; name: string | null; number: number | null; pos: string | null; grid: string | null };
};

export type AfLineup = {
  team: { id: number; name?: string };
  formation?: string | null;
  coach?: { id?: number | null; name?: string | null } | null;
  startXI?: AfLineupPlayer[] | null;
  substitutes?: AfLineupPlayer[] | null;
};

export type AfStatistics = {
  team: { id: number };
  statistics: Array<{ type: string; value: number | string | null }>;
};

export type AfPlayersBlock = {
  team: { id: number };
  players: Array<{
    player: { id: number | null };
    statistics?: Array<{ games?: { rating?: string | number | null; captain?: boolean | null } }>;
  }>;
};

export type AfFixture = {
  fixture: {
    id: number;
    referee?: string | null;
    date: string;
    venue?: { id?: number | null; name?: string | null; city?: string | null } | null;
    status: { long?: string; short: string; elapsed?: number | null; extra?: number | null };
  };
  league: { id: number; name: string; country?: string | null; logo?: string | null; flag?: string | null; season?: number | null; round?: string | null };
  teams: { home: AfTeamRef; away: AfTeamRef };
  goals: AfGoals;
  score: {
    halftime?: AfGoals;
    fulltime?: AfGoals;
    extratime?: AfGoals;
    penalty?: AfGoals;
  };
  events?: AfEvent[] | null;
  lineups?: AfLineup[] | null;
  statistics?: AfStatistics[] | null;
  players?: AfPlayersBlock[] | null;
};
