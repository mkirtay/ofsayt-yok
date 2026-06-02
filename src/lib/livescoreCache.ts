import { getRedisClient } from '@/lib/redis';

/**
 * LiveScore proxy için paylaşımlı cache katmanı.
 *
 * Amaç: Tüm istemciler (web + mobil) aynı upstream yanıtını paylaşsın; böylece
 * upstream LiveScore API istek sayısı istemci sayısından BAĞIMSIZ hale gelir ve
 * günlük request kotası korunur.
 *
 * Strateji: Redis (varsa) + in-memory fallback. Yalnızca başarılı JSON yanıtları
 * cache'lenir. TTL endpoint tipine göre belirlenir (canlı veri kısa, statik veri uzun).
 */

const PREFIX = 'lsc:'; // livescore cache

/**
 * Verilen endpoint için cache TTL'i (saniye). `null` => cache'leme.
 */
export function getCacheTtlSeconds(path: string): number | null {
  const p = path.replace(/\.json$/i, '').toLowerCase();

  switch (p) {
    // Canlı skorlar — polling aralığına yakın kısa TTL
    case 'matches/live':
      return 25;

    // Günün fikstürleri / lig fikstürleri — gün içi neredeyse sabit
    case 'fixtures/list':
      return 300;

    // Geçmiş maçlar — bitmiş veriler statiktir
    case 'matches/history':
      return 600;

    // Maç olay/istatistik/kadro — canlı maçta değişebilir, kısa tut
    case 'matches/events':
    case 'matches/stats':
    case 'matches/lineups':
      return 30;

    // Head2head — yavaş değişir
    case 'teams/head2head':
      return 3600;

    // Puan durumu / krallık / disiplin — orta TTL (canlı tablo etkisi olabilir)
    case 'competitions/table':
      return 600;
    case 'competitions/topscorers':
    case 'competitions/topdisciplinary':
      return 600;

    // Gruplar / kadro / sezon listesi — statik sayılır
    case 'competitions/groups':
    case 'competitions/squads':
    case 'competitions/rosters':
      return 86_400;
    case 'seasons/list':
      return 86_400;

    default:
      // Bilinmeyen endpoint'i tedbiren kısa süre cache'le
      return 60;
  }
}

/**
 * key/secret/path dışındaki tüm sorgu paramlarını sıralayarak deterministik
 * bir cache anahtarı üretir.
 */
export function buildCacheKey(
  path: string,
  query: Record<string, string | string[] | undefined>,
): string {
  const parts: string[] = [];
  Object.keys(query)
    .filter((k) => k !== 'path' && k !== 'key' && k !== 'secret')
    .sort()
    .forEach((k) => {
      const v = query[k];
      if (v === undefined) return;
      if (Array.isArray(v)) {
        parts.push(`${k}=${[...v].sort().join(',')}`);
      } else {
        parts.push(`${k}=${String(v)}`);
      }
    });
  const normalizedPath = path.replace(/\.json$/i, '').toLowerCase();
  return `${PREFIX}${normalizedPath}?${parts.join('&')}`;
}

type MemEntry = { value: unknown; expiresAt: number };
const MEM_MAX_ENTRIES = 500;
const memCache = new Map<string, MemEntry>();

function memGet(key: string): unknown | null {
  const entry = memCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    memCache.delete(key);
    return null;
  }
  // LRU davranışı: erişilen anahtarı sona taşı
  memCache.delete(key);
  memCache.set(key, entry);
  return entry.value;
}

function memSet(key: string, value: unknown, ttlSeconds: number): void {
  if (memCache.size >= MEM_MAX_ENTRIES) {
    const oldest = memCache.keys().next().value;
    if (oldest !== undefined) memCache.delete(oldest);
  }
  memCache.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
}

export async function readCache(key: string): Promise<unknown | null> {
  const redis = getRedisClient();
  if (redis) {
    try {
      const cached = await redis.get<unknown>(key);
      if (cached !== null && cached !== undefined) return cached;
    } catch {
      // Redis okuma hatası → in-memory fallback
    }
  }
  return memGet(key);
}

export async function writeCache(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  memSet(key, value, ttlSeconds);
  const redis = getRedisClient();
  if (redis) {
    try {
      await redis.set(key, value, { ex: ttlSeconds });
    } catch {
      // Redis yazma hatası kritik değil; in-memory snapshot geçerli
    }
  }
}
