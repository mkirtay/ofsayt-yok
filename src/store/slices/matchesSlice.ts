import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

import type { Match } from "@/models/domain";

type MatchesStatus = "idle" | "loading" | "succeeded" | "failed";

interface MatchesState {
  items: Match[];
  status: MatchesStatus;
}

const initialState: MatchesState = {
  items: [],
  status: "idle",
};

const matchesSlice = createSlice({
  name: "matches",
  initialState,
  reducers: {
    setMatches(state, action: PayloadAction<Match[]>) {
      state.items = action.payload;
      state.status = "succeeded";
    },
    mergeMatches(state, action: PayloadAction<Match[]>) {
      const incoming = action.payload;
      const existingMap = new Map(state.items.map((match) => [match.id, match]));
      const merged = incoming.map((next) => {
        const prev = existingMap.get(next.id);
        if (!prev) {
          return next;
        }
        const unchanged =
          prev.status === next.status &&
          prev.elapsed === next.elapsed &&
          prev.score.home === next.score.home &&
          prev.score.away === next.score.away &&
          prev.homeTeam.name === next.homeTeam.name &&
          prev.awayTeam.name === next.awayTeam.name;
        return unchanged ? prev : next;
      });
      state.items = merged;
      state.status = "succeeded";
    },
    setMatchesStatus(state, action: PayloadAction<MatchesStatus>) {
      state.status = action.payload;
    },
  },
});

export const { setMatches, mergeMatches, setMatchesStatus } = matchesSlice.actions;
export default matchesSlice.reducer;
