/**
 * Canlı skor cache'i (Faz 6) — yalnızca `/livescores/inplay`.
 *
 * Cache noktası `/api/sportmonks/[...path]` proxy route'u: canlı skor
 * çağrılarının TAMAMI (`getLiveMatches`/`getAllLiveMatches` — react-query
 * hook'ları, tarayıcıdan) o route'tan geçiyor, dolayısıyla tek bir yerde
 * cache'lemek tüm istemciler arasında paylaşımlı — upstream istek sayısı
 * kullanıcı sayısından bağımsız kalıyor. Mevcut Redis/in-memory katmanı
 * (`lib/livescoreCache.ts` `readCache`/`writeCache`) yeniden kullanılıyor.
 * Sadece `NEXT_PUBLIC_SPORTMONKS_ENABLED` açıkken bu route'a istek gelir; eski
 * sağlayıcı yolu (`/api/livescore/...`) bu katmana hiç dokunmaz.
 */
import { readCache, writeCache } from '@/lib/livescoreCache';

/** 15-30 sn aralığından seçilen değer: 30 sn'lik client polling'ine yakın, skor gecikmesi ≤20 sn. */
export const SPORTMONKS_LIVE_SCORE_CACHE_TTL_SECONDS = 20;

const LIVE_PATH = 'football/livescores/inplay';
const KEY_PREFIX = 'sportmonks:live:';

export function isLiveScorePath(path: string): boolean {
  return path.replace(/^\/+|\/+$/g, '').toLowerCase() === LIVE_PATH;
}

/** `api_token`/`path` hariç sorgu parametrelerini sıralayarak deterministik anahtar üretir (include/page/per_page ayrı ayrı cache'lenir). */
export function buildLiveScoreCacheKey(query: Record<string, string | string[] | undefined>): string {
  const parts = Object.keys(query)
    .filter((k) => k !== 'path' && k !== 'api_token')
    .sort()
    .map((k) => {
      const v = query[k];
      return v === undefined ? null : `${k}=${Array.isArray(v) ? [...v].sort().join(',') : v}`;
    })
    .filter((x): x is string => x !== null);
  return `${KEY_PREFIX}${parts.join('&')}`;
}

export type LiveScoreFetchResult = { status: number; data: unknown; cache: 'HIT' | 'MISS' };

/**
 * Cache'te varsa Sportmonks'a hiç gitmez; yoksa `fetchUpstream`'i çağırır ve
 * yalnızca başarılı (HTTP 200, hata mesajı olmayan) yanıtı TTL ile yazar.
 */
export async function fetchLiveScoreCached(
  query: Record<string, string | string[] | undefined>,
  fetchUpstream: () => Promise<{ status: number; data: unknown }>,
): Promise<LiveScoreFetchResult> {
  const key = buildLiveScoreCacheKey(query);
  const cached = await readCache(key);
  if (cached !== null && cached !== undefined) {
    return { status: 200, data: cached, cache: 'HIT' };
  }
  const upstream = await fetchUpstream();
  const ok =
    upstream.status === 200 &&
    upstream.data != null &&
    typeof upstream.data === 'object' &&
    !('message' in (upstream.data as object) && !('data' in (upstream.data as object)));
  if (ok) await writeCache(key, upstream.data, SPORTMONKS_LIVE_SCORE_CACHE_TTL_SECONDS);
  return { ...upstream, cache: 'MISS' };
}
