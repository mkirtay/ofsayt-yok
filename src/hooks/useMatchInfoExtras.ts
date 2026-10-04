import { useQuery } from '@tanstack/react-query';
import type { RefereeSummary } from '@/services/sportmonks/refereeStats';

/**
 * Maç bilgi kartının ek verileri: derbi rozeti (takım rakip listeleri) ve hakem istatistik kartı. İkisi de sunucuda
 * uzun süre cache'li normalize uçlardan (`/api/matches/derby`, `/api/referees/{id}/summary`).
 */
export function useIsDerby(homeId: number | undefined, awayId: number | undefined) {
  const enabled = Boolean(homeId && awayId && homeId !== awayId);
  return useQuery({
    queryKey: ['match-derby', homeId ?? 0, awayId ?? 0] as const,
    queryFn: async (): Promise<boolean> => {
      const res = await fetch(`/api/matches/derby?home=${homeId}&away=${awayId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return Boolean(((await res.json()) as { derby?: boolean }).derby);
    },
    enabled,
    staleTime: 12 * 60 * 60_000,
    gcTime: 24 * 60 * 60_000,
    retry: 1,
  });
}

/** Yalnız kart açıkken (`enabled`) çekilir. 404 → `null` (hakemin istatistiği yok). */
export function useRefereeSummary(refereeId: number | undefined, seasonId: number | undefined, leagueId: number | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['referee-summary', refereeId ?? 0, seasonId ?? 0, leagueId ?? 0] as const,
    queryFn: async (): Promise<RefereeSummary | null> => {
      const qs = new URLSearchParams({ season: String(seasonId) });
      if (leagueId) qs.set('league', String(leagueId));
      const res = await fetch(`/api/referees/${refereeId}/summary?${qs.toString()}`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as RefereeSummary;
    },
    enabled: enabled && Boolean(refereeId && seasonId),
    staleTime: 12 * 60 * 60_000,
    gcTime: 24 * 60 * 60_000,
    retry: 1,
  });
}
