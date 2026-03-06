import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

import type { Team } from "@/models/domain";

interface TeamsState {
  items: Team[];
}

const initialState: TeamsState = {
  items: [],
};

const teamsSlice = createSlice({
  name: "teams",
  initialState,
  reducers: {
    setTeams(state, action: PayloadAction<Team[]>) {
      state.items = action.payload;
    },
  },
});

export const { setTeams } = teamsSlice.actions;
export default teamsSlice.reducer;
