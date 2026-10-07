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

/**
 * Tek değerin Redis'e yazılabilecek üst sınırı (bayt, JSON). Upstash isteği en çok 10 MB ve istemcinin otomatik
 * pipeline'ı (varsayılan açık) aynı mikro-görev turundaki komutları TEK HTTP isteğinde birleştirir: tek bir büyük
 * değer bütün birleşik isteği düşürür. Büyük yanıtlar sıkıştırılır (bkz. server/sportmonks/cachedFetch.ts), sığmayan
 * yazılmaz (yalnız instance belleğinde kalır).
 */
export const MAX_REDIS_VALUE_BYTES = 900_000;

const utf8 = new TextEncoder();

/** Değerin Redis'e gidecek JSON boyutu (bayt); serileştirilemiyorsa sonsuz. */
export function redisValueBytes(value: unknown): number {
  try {
    return utf8.encode(JSON.stringify(value) ?? '').length;
  } catch {
    return Infinity;
  }
}

export function fitsInRedis(value: unknown): boolean {
  return redisValueBytes(value) <= MAX_REDIS_VALUE_BYTES;
}

/**
 * Boyut kaynaklı ret: istek 10 MB'ı aştı ("max request size exceeded") ya da veritabanı doldu (OOM / max data size).
 * Redis'in arızası değil — okumalar çalışmaya devam eder.
 */
export function isRedisSizeLimitError(error: unknown): boolean {
  return /max request size|request size exceeded|request entity too large|max (db|database|data) size|OOM command not allowed/i.test(
    String((error as Error)?.message ?? error),
  );
}
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
  } catch (error) {
    // Boyut hatası devre kesiciyi AÇMAZ: açsaydı instance 30 sn boyunca hiç cache okumaz, her istek upstream'e giderdi.
    if (isRedisSizeLimitError(error)) {
      console.warn('[redis] boyut sınırı (istek 10 MB / veritabanı dolu) — bu komut atlandı', String((error as Error)?.message ?? error).slice(0, 200));
      return fallback;
    }
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
