import { useQuery } from '@tanstack/react-query';
import type { TurkeyTeamTiersPayload } from '@/config/turkeyTiers';

async function fetchTurkeyTeamTiers(): Promise<TurkeyTeamTiersPayload> {
  const res = await fetch('/api/leagues/turkey-team-tiers');
  if (!res.ok) throw new Error(`turkey-team-tiers ${res.status}`);
  return (await res.json()) as TurkeyTeamTiersPayload;
}

/** Kupa maçı rozetleri için takım → kademe haritası. Yalnızca listede/detayda Türkiye Kupası maçı varsa (`enabled`) çekilir; 24 sa taze. */
export function useTurkeyTeamTiers(enabled: boolean) {
  return useQuery({
    queryKey: ['turkey-team-tiers'] as const,
    queryFn: fetchTurkeyTeamTiers,
    enabled,
    staleTime: 24 * 60 * 60_000,
    gcTime: 24 * 60 * 60_000,
    retry: 1,
  });
}
