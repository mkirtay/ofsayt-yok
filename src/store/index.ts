import { configureStore } from "@reduxjs/toolkit";

import matchesReducer from "@/store/slices/matchesSlice";
import matchDetailReducer from "@/store/slices/matchDetailSlice";
import teamsReducer from "@/store/slices/teamsSlice";
import uiReducer from "@/store/slices/uiSlice";

export const store = configureStore({
  reducer: {
    matches: matchesReducer,
    matchDetail: matchDetailReducer,
    teams: teamsReducer,
    ui: uiReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
