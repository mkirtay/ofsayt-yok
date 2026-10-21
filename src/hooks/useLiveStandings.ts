import { useQuery } from '@tanstack/react-query';
import { fetchLiveStandings, type LiveStandingsData } from '@/services/liveStandings';

/** Sportmonks önbelleği 45 sn taze tutar (cachePolicy); istemci dakikada bir sorar, sekme gizliyken durur. */
export const LIVE_STANDINGS_REFRESH_MS = 60_000;

/**
 * Canlı puan durumu katmanı. YALNIZ `enabled` (o ligde canlı maç var) iken istek atar; kapalıyken önbellekteki
 * eski veri de döndürülmez (maç bitince ok / canlı puan kalmasın). Hata → `null`: normal tablo sessizce görünür.
 */
export function useLiveStandings(leagueId: number | null | undefined, enabled: boolean): LiveStandingsData | null {
  const on = enabled && leagueId != null && leagueId > 0;
  const q = useQuery({
    queryKey: ['live-standings', leagueId ?? 0] as const,
    queryFn: () => fetchLiveStandings(leagueId!),
    enabled: on,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    refetchInterval: on ? LIVE_STANDINGS_REFRESH_MS : false,
    refetchIntervalInBackground: false,
    retry: 1,
  });
  if (!on || q.isError || !q.data) return null;
  return q.data;
}
