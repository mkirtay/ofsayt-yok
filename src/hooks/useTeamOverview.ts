import { useQuery } from '@tanstack/react-query';
import { getTeamOverview } from '@/services/teamPage';

/**
 * Takım sayfasının tek isteği: Son Maçlar, Fikstür, başlıktaki form ve sıradaki maç aynı sorguyu paylaşır.
 * Tazelik proxy/CDN tarafında (canlı maçta 30 sn, yoksa en çok 15 dk — cachePolicy `teams`); istemci 60 sn.
 */
export function useTeamOverview(teamId: string, enabled = true) {
  return useQuery({
    queryKey: ['team-overview', teamId] as const,
    queryFn: () => getTeamOverview(teamId),
    enabled: enabled && Boolean(teamId),
    staleTime: 60_000,
    gcTime: 30 * 60_000,
  });
}
