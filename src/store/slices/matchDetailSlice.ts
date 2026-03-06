import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

import type { Event, Lineup, Match, MatchStat } from "@/models/domain";

interface MatchDetailState {
  match: Match | null;
  events: Event[];
  lineups: Lineup[];
  stats: MatchStat[];
}

const initialState: MatchDetailState = {
  match: null,
  events: [],
  lineups: [],
  stats: [],
};

const matchDetailSlice = createSlice({
  name: "matchDetail",
  initialState,
  reducers: {
    setMatchDetail(
      state,
      action: PayloadAction<{
        match: Match | null;
        events: Event[];
        lineups: Lineup[];
        stats: MatchStat[];
      }>
    ) {
      state.match = action.payload.match;
      state.events = action.payload.events;
      state.lineups = action.payload.lineups;
      state.stats = action.payload.stats;
    },
  },
});

export const { setMatchDetail } = matchDetailSlice.actions;
export default matchDetailSlice.reducer;
