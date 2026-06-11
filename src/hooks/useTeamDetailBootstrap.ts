import { useQuery, type QueryClient } from '@tanstack/react-query';
import type { Match } from '@/models/liveScore';
import {
  getTeamCompetitions,
  getTeamLastMatches,
  type TeamCompetitionRow,
} from '@/services/liveScoreService';

export type TeamDetailBootstrapData = {
  lastMatches: Match[];
  competitions: TeamCompetitionRow[];
  selectedCompetitionId: string;
};

async function fetchTeamDetailBootstrap(teamId: string): Promise<TeamDetailBootstrapData> {
  const lastMatches = await getTeamLastMatches(teamId);
  const competitions = getTeamCompetitions(lastMatches, teamId);
  return {
    lastMatches,
    competitions,
    selectedCompetitionId: competitions.length > 0 ? String(competitions[0]!.id) : '',
  };
}

export function teamDetailBootstrapQueryKey(teamId: string) {
  return ['team-detail-bootstrap', teamId] as const;
}

export function useTeamDetailBootstrap(teamId: string, enabled = true) {
  return useQuery({
    queryKey: teamDetailBootstrapQueryKey(teamId),
    queryFn: () => fetchTeamDetailBootstrap(teamId),
    enabled: enabled && Boolean(teamId),
    staleTime: 60_000,
    gcTime: 10 * 60_000,
  });
}

export function prefetchTeamDetailBootstrap(queryClient: QueryClient, teamId: string) {
  return queryClient.prefetchQuery({
    queryKey: teamDetailBootstrapQueryKey(teamId),
    queryFn: () => fetchTeamDetailBootstrap(teamId),
    staleTime: 60_000,
  });
}
