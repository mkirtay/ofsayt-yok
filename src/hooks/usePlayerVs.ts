import { useQuery } from '@tanstack/react-query';
import type { PlayerMatchesResponse } from '@/pages/api/players/[id]/matches';
import type { PlayerVsOpponentsResponse, PlayerVsResponse } from '@/pages/api/players/[id]/vs';

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return (await res.json()) as T;
}

/** Oyuncunun karşılaştığı rakipler (sunucuda oyuncu başına 12 saat cache'li tek Sportmonks isteği). */
export function usePlayerVsOpponents(playerId: number | null) {
  return useQuery({
    queryKey: ['player-vs-opponents', playerId],
    queryFn: () => getJson<PlayerVsOpponentsResponse>(`/api/players/${playerId}/vs`),
    enabled: playerId != null,
    staleTime: 30 * 60_000,
  });
}

/** Seçili rakibe karşı maçlar + özet (aynı cache'li satırlardan, ek Sportmonks isteği yok). */
export function usePlayerVs(playerId: number | null, opponentId: number | null) {
  return useQuery({
    queryKey: ['player-vs', playerId, opponentId],
    queryFn: () => getJson<PlayerVsResponse>(`/api/players/${playerId}/vs?opponentId=${opponentId}`),
    enabled: playerId != null && opponentId != null,
    staleTime: 30 * 60_000,
  });
}

/**
 * Oyuncunun son maçları (rating grafiği + Maç Geçmişi aynı sorguyu paylaşır; sunucuda `/vs` ile aynı 12 saatlik cache).
 */
export function usePlayerRecentMatches(playerId: number | null) {
  return useQuery({
    queryKey: ['player-recent-matches', playerId],
    queryFn: () => getJson<PlayerMatchesResponse>(`/api/players/${playerId}/matches`),
    enabled: playerId != null,
    staleTime: 30 * 60_000,
  });
}
