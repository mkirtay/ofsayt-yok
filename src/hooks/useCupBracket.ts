import { useQuery } from '@tanstack/react-query';
import type { CupBracket } from '@/services/cupBracket/types';

/**
 * Kupa eleme ağacı (`/api/leagues/bracket`, CDN'li; bkz. server/cupBracket.ts). `null` = sezonda eleme verisi yok
 * (sekme gizlenir). Hata FIRLATIR (hata ≠ veri yok): sekme açık kalır, "yüklenemedi · tekrar dene".
 */
export async function fetchCupBracket(leagueId: number, seasonId: number | null): Promise<CupBracket | null> {
  const qs = new URLSearchParams({ league: String(leagueId), ...(seasonId != null ? { season: String(seasonId) } : {}) });
  const res = await fetch(`/api/leagues/bracket?${qs}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`bracket ${res.status}`);
  const body = (await res.json()) as { bracket?: CupBracket | null };
  return body.bracket ?? null;
}

export function useCupBracket(leagueId: number | null, seasonId: number | null, enabled: boolean) {
  return useQuery<CupBracket | null>({
    queryKey: ['cup-bracket', leagueId, seasonId ?? 'current'] as const,
    queryFn: () => fetchCupBracket(leagueId!, seasonId),
    enabled: enabled && leagueId != null,
    staleTime: 5 * 60_000,
    gcTime: 15 * 60_000,
    retry: 1,
  });
}
