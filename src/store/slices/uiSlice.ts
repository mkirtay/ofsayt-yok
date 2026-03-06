import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

type MatchFilter = "all" | "live" | "finished";

interface UiState {
  matchFilter: MatchFilter;
}

const initialState: UiState = {
  matchFilter: "all",
};

const uiSlice = createSlice({
  name: "ui",
  initialState,
  reducers: {
    setMatchFilter(state, action: PayloadAction<MatchFilter>) {
      state.matchFilter = action.payload;
    },
  },
});

export const { setMatchFilter } = uiSlice.actions;
export default uiSlice.reducer;
