import { useQuery } from '@tanstack/react-query';
import { getTeamUpcomingFixtures } from '@/services/liveScoreService';
import { TEAM_UPCOMING_CACHE_TTL_SECONDS } from '@/services/sportmonks/teamUpcoming';

/** Takım fikstürü — sekme + başlıktaki "Sıradaki maç" aynı sorguyu paylaşır; tazelik proxy cache'iyle aynı (10 dk). */
export function useTeamUpcomingFixtures(teamId: string, enabled = true) {
  return useQuery({
    queryKey: ['team-upcoming-fixtures', teamId] as const,
    queryFn: () => getTeamUpcomingFixtures(teamId),
    enabled: enabled && Boolean(teamId),
    staleTime: TEAM_UPCOMING_CACHE_TTL_SECONDS * 1000,
    gcTime: 30 * 60_000,
  });
}
