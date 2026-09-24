import { useQuery } from '@tanstack/react-query';
import { getPlayerProfile, type PlayerProfile } from '@/services/playerProfile';

/** Oyuncu profili (tek çağrı; proxy'de 30 dk cache'li) — react-query tarafında da 10 dk taze. */
export function usePlayerProfile(playerId: string, enabled = true) {
  return useQuery<PlayerProfile | null>({
    queryKey: ['player-profile', playerId],
    queryFn: () => getPlayerProfile(playerId),
    enabled: enabled && /^\d+$/.test(playerId),
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
  });
}
