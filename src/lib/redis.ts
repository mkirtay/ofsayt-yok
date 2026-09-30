import { Redis } from '@upstash/redis';

/**
 * Redis (Upstash REST) — cache ve rate limit için. Redis bir KOLAYLIK: yavaşlarsa/düşerse istekler
 * onu beklememeli.
 * - Komut başına ~1 sn zaman aşımı (`signal` her komutta yeni; zaman aşımında yeniden denenmez),
 *   ağ hatasında en fazla 1 yeniden deneme. (Varsayılan 5 deneme + üstel bekleme komut başına ~4 sn
 *   ekliyordu; cache MISS başına 4 komutla istek onlarca saniye asılıyordu.)
 * - Devre kesici: art arda `REDIS_FAILURE_THRESHOLD` hatadan sonra Redis `REDIS_BYPASS_MS` boyunca hiç
 *   denenmez — her istek zaman aşımını beklemesin. Bu sürede `withRedis` doğrudan yedek değeri döner.
 */
export const REDIS_COMMAND_TIMEOUT_MS = 1_000;
export const REDIS_FAILURE_THRESHOLD = 3;
export const REDIS_BYPASS_MS = 30_000;

let client: Redis | null = null;

export function getRedisClient(): Redis | null {
  if (client) return client;
  // Vercel KV entegrasyonu KV_REST_API_* prefix'i kullanır; direkt Upstash UPSTASH_REDIS_REST_* kullanır
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  client = new Redis({
    url,
    token,
    retry: { retries: 1, backoff: () => 100 },
    signal: () => AbortSignal.timeout(REDIS_COMMAND_TIMEOUT_MS),
  });
  return client;
}

// ─── Devre kesici ──────────────────────────────────────────────────────────

let consecutiveFailures = 0;
let bypassUntil = 0;

export function isRedisBypassed(now: number = Date.now()): boolean {
  return now < bypassUntil;
}

function recordFailure(now: number): void {
  consecutiveFailures += 1;
  if (consecutiveFailures >= REDIS_FAILURE_THRESHOLD) {
    bypassUntil = now + REDIS_BYPASS_MS;
    consecutiveFailures = 0;
    console.warn(`[redis] art arda ${REDIS_FAILURE_THRESHOLD} hata — ${REDIS_BYPASS_MS / 1000} sn atlanıyor`);
  }
}

/**
 * Redis komutunu çalıştırır; Redis yoksa, devre açıksa ya da komut hata/zaman aşımı verirse `fallback`
 * döner (asla fırlatmaz). Cache "yokmuş gibi" devam eder; çağıran yedek davranışını `fallback`le seçer.
 */
export async function withRedis<T>(fn: (redis: Redis) => Promise<T>, fallback: T): Promise<T> {
  const redis = getRedisClient();
  if (!redis || isRedisBypassed()) return fallback;
  try {
    const value = await fn(redis);
    consecutiveFailures = 0;
    return value;
  } catch {
    recordFailure(Date.now());
    return fallback;
  }
}

/** Test yardımcısı. */
export function resetRedisStateForTests(): void {
  client = null;
  consecutiveFailures = 0;
  bypassUntil = 0;
}
