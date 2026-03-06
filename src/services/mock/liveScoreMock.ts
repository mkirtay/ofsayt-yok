import type {
  LiveScoreMatchDetailResponse,
  LiveScoreMatchResponse,
} from "@/models/liveScore";

export const liveScoreMatchesMock: LiveScoreMatchResponse = {
  matches: [
    {
      id: 101,
      status: "1H",
      elapsed: 32,
      league: {
        country: "Türkiye",
        competition: "Süper Lig",
        competitionId: 1,
      },
      home: {
        id: 1,
        name: "Fenerbahçe",
        logo: "/teams/fenerbahce.svg",
      },
      away: {
        id: 2,
        name: "Galatasaray",
        logo: "/teams/galatasaray.svg",
      },
      score: {
        home: 1,
        away: 0,
      },
    },
    {
      id: 102,
      status: "FT",
      elapsed: 90,
      league: {
        country: "Spain",
        competition: "La Liga",
        competitionId: 2,
      },
      home: {
        id: 3,
        name: "Real Madrid",
        logo: "/teams/realmadrid.svg",
      },
      away: {
        id: 4,
        name: "Barcelona",
        logo: "/teams/barcelona.svg",
      },
      score: {
        home: 2,
        away: 2,
      },
    },
  ],
};

export const liveScoreMatchDetailMock: Record<
  number,
  LiveScoreMatchDetailResponse
> = {
  101: {
    matchId: 101,
    events: [
      { type: "goal", minute: 12, teamId: 1, player: "M. Tadic" },
      { type: "card", minute: 28, teamId: 2, player: "L. Torreira" },
    ],
    lineups: [
      {
        teamId: 1,
        formation: "4-2-3-1",
        startXI: [
          { name: "D. Livakovic", number: 1 },
          { name: "B. Osayi-Samuel", number: 21 },
          { name: "A. Djiku", number: 6 },
          { name: "R. Becao", number: 50 },
          { name: "F. Kostic", number: 7 },
        ],
      },
      {
        teamId: 2,
        formation: "4-2-3-1",
        startXI: [
          { name: "F. Muslera", number: 1 },
          { name: "B. Yilmaz", number: 23 },
          { name: "D. Sanchez", number: 6 },
          { name: "A. Bardakci", number: 42 },
          { name: "K. Akturkoglu", number: 7 },
        ],
      },
    ],
    stats: [
      { label: "Possession", home: 54, away: 46 },
      { label: "Shots", home: 10, away: 6 },
      { label: "Corners", home: 4, away: 2 },
    ],
  },
  102: {
    matchId: 102,
    events: [
      { type: "goal", minute: 4, teamId: 3, player: "V. Junior" },
      { type: "goal", minute: 44, teamId: 4, player: "R. Lewandowski" },
      { type: "goal", minute: 61, teamId: 3, player: "J. Bellingham" },
      { type: "goal", minute: 88, teamId: 4, player: "Lamine Yamal" },
    ],
    lineups: [
      {
        teamId: 3,
        formation: "4-3-3",
        startXI: [
          { name: "T. Courtois", number: 1 },
          { name: "D. Carvajal", number: 2 },
          { name: "A. Rudiger", number: 22 },
          { name: "E. Camavinga", number: 12 },
          { name: "F. Valverde", number: 15 },
        ],
      },
      {
        teamId: 4,
        formation: "4-3-3",
        startXI: [
          { name: "M. ter Stegen", number: 1 },
          { name: "J. Kounde", number: 23 },
          { name: "A. Araujo", number: 4 },
          { name: "A. Balde", number: 3 },
          { name: "F. de Jong", number: 21 },
        ],
      },
    ],
    stats: [
      { label: "Possession", home: 49, away: 51 },
      { label: "Shots", home: 14, away: 12 },
      { label: "Corners", home: 6, away: 5 },
    ],
  },
};
