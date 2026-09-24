/**
 * İstatistik ağırlıklı Sportmonks çağrıları için proxy cache'i (tüm istemciler için paylaşımlı).
 *
 * Kapsam (yalnızca `include`'unda `statistics` olan çağrılar — düz kadro/oyuncu çağrılarına dokunulmaz):
 *  - `/squads/seasons/{sid}/teams/{tid}` — Gol Krallığı "O" sütunu (`PlayerStatistic` havuzu, takım başına 1 istek)
 *  - `/players/{id}` — oyuncu detay sayfası (`Player` havuzu, ziyaret başına 1 istek)
 * Ek olarak (istatistik değil ama aynı gerekçe): `/teams/{id}` + `upcoming` include'u — takım fikstürü
 * (`Team` havuzu, ziyaret başına 1 istek; bkz. teamUpcoming.ts). Fikstür saat/tarih değişikliği ve başlayan maçın
 * listeden düşmesi en geç 10 dk gecikmeyle yansır.
 * Ayrıca oyuncu sayfası rating grafiği (takım başına 2 istek, 30 dk): `/fixtures/between/{from}/{to}/{team}` +
 * `filters=fixtureStates:5` (yalnızca bitmiş maç id'leri) ve `/fixtures/multi/{ids}` + `lineups.details`.
 *
 * Neden: istatistik ancak maç bitince değişir; 30 dk cache upstream istek sayısını kullanıcı sayısından bağımsız
 * kılar (havuzlar 2500/saat). Mevcut `readCache`/`writeCache` katmanı (`liveScoreCache.ts` ile aynı) kullanılır.
 */
import { readCache, writeCache } from '@/lib/livescoreCache';
import { TEAM_UPCOMING_CACHE_TTL_SECONDS } from './teamUpcoming';

export { TEAM_UPCOMING_CACHE_TTL_SECONDS };

export const STATS_CACHE_TTL_SECONDS = 30 * 60;

/** Yol + include'da (ve varsa `filters`'da) aranan parça → TTL. İlk eşleşen kural geçerli. */
const CACHE_RULES: { path: RegExp; include: string; filters?: string; ttl: number }[] = [
  { path: /^football\/squads\/seasons\/\d+\/teams\/\d+$/, include: 'statistics', ttl: STATS_CACHE_TTL_SECONDS },
  { path: /^football\/players\/\d+$/, include: 'statistics', ttl: STATS_CACHE_TTL_SECONDS },
  { path: /^football\/teams\/\d+$/, include: 'upcoming', ttl: TEAM_UPCOMING_CACHE_TTL_SECONDS },
  // Oyuncu rating grafiği: takımın son 20 BİTMİŞ maçı + lineups.details (bitmiş maç reytingi değişmez; bkz. playerProfile.ts)
  { path: /^football\/fixtures\/multi\/\d+(,\d+)*$/, include: 'lineups.details', ttl: STATS_CACHE_TTL_SECONDS },
  // …ve o grafiğin maç id listesi: takımın YALNIZCA BİTMİŞ maçları (`fixtureStates:5` — canlı/planlı maç içermez)
  {
    path: /^football\/fixtures\/between\/\d{4}-\d{2}-\d{2}\/\d{4}-\d{2}-\d{2}\/\d+$/,
    include: '',
    filters: 'fixtureStates:5',
    ttl: STATS_CACHE_TTL_SECONDS,
  },
];

const norm = (path: string) => path.replace(/^\/+|\/+$/g, '');

/** Çağrı cache kapsamındaysa TTL (sn), değilse null. */
export function statsCacheTtl(path: string, query: Record<string, string | string[] | undefined>): number | null {
  const inc = query.include;
  const include = Array.isArray(inc) ? inc.join(',') : (inc ?? '');
  const f = query.filters;
  const filters = Array.isArray(f) ? f.join(',') : (f ?? '');
  const p = norm(path);
  return CACHE_RULES.find((r) => r.path.test(p) && include.includes(r.include) && (!r.filters || filters.includes(r.filters)))?.ttl ?? null;
}

export function isStatsCacheable(path: string, query: Record<string, string | string[] | undefined>): boolean {
  return statsCacheTtl(path, query) !== null;
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
  const ttl = statsCacheTtl(path, query) ?? STATS_CACHE_TTL_SECONDS;
  const cached = await readCache(key);
  if (cached !== null && cached !== undefined) return { status: 200, data: cached, cache: 'HIT' };
  const upstream = await fetchUpstream();
  const body = upstream.data as { data?: unknown } | null;
  // Yalnızca gerçek veri içeren 200 yanıtı yazılır (hata/kota mesajı cache'lenmez). `data` liste (kadro) ya da nesne (oyuncu).
  if (upstream.status === 200 && body && typeof body === 'object' && body.data != null && typeof body.data === 'object') {
    await writeCache(key, upstream.data, ttl);
  }
  return { ...upstream, cache: 'MISS' };
}
