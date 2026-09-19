/**
 * İstatistik ağırlıklı Sportmonks çağrıları için proxy cache'i (tüm istemciler için paylaşımlı).
 *
 * Kapsam (yalnızca `include`'unda `statistics` olan çağrılar — düz kadro/oyuncu çağrılarına dokunulmaz):
 *  - `/squads/seasons/{sid}/teams/{tid}` — Gol Krallığı "O" sütunu (`PlayerStatistic` havuzu, takım başına 1 istek)
 *  - `/players/{id}` — oyuncu detay sayfası (`Player` havuzu, ziyaret başına 1 istek)
 *
 * Neden: istatistik ancak maç bitince değişir; 30 dk cache upstream istek sayısını kullanıcı sayısından bağımsız
 * kılar (havuzlar 2500/saat). Mevcut `readCache`/`writeCache` katmanı (`liveScoreCache.ts` ile aynı) kullanılır.
 */
import { readCache, writeCache } from '@/lib/livescoreCache';

export const STATS_CACHE_TTL_SECONDS = 30 * 60;

const CACHEABLE_PATHS = [/^football\/squads\/seasons\/\d+\/teams\/\d+$/, /^football\/players\/\d+$/];

const norm = (path: string) => path.replace(/^\/+|\/+$/g, '');

export function isStatsCacheable(path: string, query: Record<string, string | string[] | undefined>): boolean {
  const inc = query.include;
  const include = Array.isArray(inc) ? inc.join(',') : (inc ?? '');
  return CACHEABLE_PATHS.some((re) => re.test(norm(path))) && include.includes('statistics');
}

export function buildStatsCacheKey(path: string, query: Record<string, string | string[] | undefined>): string {
  const parts = Object.keys(query)
    .filter((k) => k !== 'path' && k !== 'api_token')
    .sort()
    .map((k) => `${k}=${Array.isArray(query[k]) ? [...(query[k] as string[])].sort().join(',') : query[k]}`);
  return `sportmonks:stats:${norm(path)}?${parts.join('&')}`;
}

export async function fetchStatsCached(
  path: string,
  query: Record<string, string | string[] | undefined>,
  fetchUpstream: () => Promise<{ status: number; data: unknown }>,
): Promise<{ status: number; data: unknown; cache: 'HIT' | 'MISS' }> {
  const key = buildStatsCacheKey(path, query);
  const cached = await readCache(key);
  if (cached !== null && cached !== undefined) return { status: 200, data: cached, cache: 'HIT' };
  const upstream = await fetchUpstream();
  const body = upstream.data as { data?: unknown } | null;
  // Yalnızca gerçek veri içeren 200 yanıtı yazılır (hata/kota mesajı cache'lenmez). `data` liste (kadro) ya da nesne (oyuncu).
  if (upstream.status === 200 && body && typeof body === 'object' && body.data != null && typeof body.data === 'object') {
    await writeCache(key, upstream.data, STATS_CACHE_TTL_SECONDS);
  }
  return { ...upstream, cache: 'MISS' };
}
