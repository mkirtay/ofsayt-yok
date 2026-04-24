import type { Match } from '@/models/liveScore';
import type {
  CompetitionTableData,
  SeasonListItem,
  TopScorersPayload,
} from '@/services/liveScoreService';

/** Ana sayfa (`/`) `MatchHubPage` için SSR paketi */
export type MatchHubHomeInitialServerPayload = {
  competitionId: number;
  selectedDate: string;
  allMatches: Match[];
  liveMatches: Match[];
  fixtureMatches: Match[];
  seasons: SeasonListItem[];
  selectedSeasonId: number | null;
  standings: CompetitionTableData | null;
  topScorers: TopScorersPayload | null;
};
