export const LEAGUE_PRIORITY = {
  TURKEY: [
    6,   // Turkey Super Lig
    344, // Turkey 1. Lig
  ],
  UEFA_INTL: [
    244, // UEFA Champions League
    387, // UEFA EURO
    362, // FIFA World Cup
  ],
  TOP_5: [
    2, // Premier League
    3, // La Liga
    4, // Serie A
    1, // Bundesliga
    5, // Ligue 1 (assumed)
  ],
};

export const getLeaguePriorityGroup = (competitionId: number) => {
  if (LEAGUE_PRIORITY.TURKEY.includes(competitionId)) return 1;
  if (LEAGUE_PRIORITY.UEFA_INTL.includes(competitionId)) return 2;
  if (LEAGUE_PRIORITY.TOP_5.includes(competitionId)) return 3;
  return 4; // Other leagues
};
