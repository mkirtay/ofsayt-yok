import type { Match } from '@/models/liveScore';
import type {
  CompetitionTableData,
  SeasonListItem,
  TopScorersPayload,
} from '@/services/liveScoreService';

/** `/uefa` için `getServerSideProps` → `MatchHubPage` hidrasyonu */
export type UefaHubInitialServerPayload = {
  competitionId: number;
  liveMatches: Match[];
  uefaCompFixtures: Match[];
  uefaHistory: Match[];
  seasons: SeasonListItem[];
  selectedSeasonId: number | null;
  standings: CompetitionTableData | null;
  topScorers: TopScorersPayload | null;
};
