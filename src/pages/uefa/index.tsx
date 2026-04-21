import MatchHubPage from '@/components/MatchHubPage';
import {
  UEFA_CHAMPIONS_LEAGUE_ID,
  UEFA_SIDEBAR_LEAGUES,
  UEFA_TIER2_COMPETITION_IDS,
} from '@/config/leagues';

export default function UefaPage() {
  return (
    <MatchHubPage
      sidebarLeagues={UEFA_SIDEBAR_LEAGUES}
      defaultCompetitionId={UEFA_CHAMPIONS_LEAGUE_ID}
      allowedCompetitionIds={UEFA_TIER2_COMPETITION_IDS}
    />
  );
}
