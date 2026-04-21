import MatchHubPage from '@/components/MatchHubPage';
import { SIDEBAR_LEAGUES } from '@/config/leagues';

const DEFAULT_COMPETITION_ID = 6;

export default function Home() {
  return (
    <MatchHubPage
      sidebarLeagues={SIDEBAR_LEAGUES}
      defaultCompetitionId={DEFAULT_COMPETITION_ID}
      allowedCompetitionIds={null}
    />
  );
}
