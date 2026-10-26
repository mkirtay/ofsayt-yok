import { useQuery } from '@tanstack/react-query';
import { fetchLiveStandings, type LiveStandingsData } from '@/services/liveStandings';

/** Sportmonks önbelleği 45 sn taze tutar (cachePolicy); istemci dakikada bir sorar, sekme gizliyken durur. */
export const LIVE_STANDINGS_REFRESH_MS = 60_000;

/** Bu kadar süredir yeni canlı veri yoksa (iki poll + pay) tablo "canlı" değil, "son güncelleme" olarak sunulur. */
export const LIVE_STANDINGS_STALE_MS = 3 * LIVE_STANDINGS_REFRESH_MS;

export type LiveStandingsState = {
  data: LiveStandingsData;
  /** Son başarılı yanıtın zamanı (ms). */
  updatedAt: number;
  /** Son yenileme başarısız oldu: veri korunur ama canlı gibi sunulmaz. */
  failing: boolean;
};

/** Veri eski mi (son yenileme başarısız ya da uzun süredir yeni yanıt yok). */
export function isLiveStandingsStale(state: LiveStandingsState, now: number): boolean {
  return state.failing || now - state.updatedAt > LIVE_STANDINGS_STALE_MS;
}

/**
 * Canlı puan durumu katmanı. YALNIZ `enabled` (o ligde canlı maç var) iken istek atar; kapalıyken önbellekteki
 * eski veri de döndürülmez (maç bitince ok / canlı puan kalmasın). İlk yanıt gelmeden hata → `null` (normal tablo);
 * sonraki yenileme hatasında son veri korunur, `failing` ile işaretlenir (tablo baştan yüklenmez).
 */
export function useLiveStandings(leagueId: number | null | undefined, enabled: boolean): LiveStandingsState | null {
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
  if (!on || !q.data) return null;
  return { data: q.data, updatedAt: q.dataUpdatedAt, failing: q.isError };
}
