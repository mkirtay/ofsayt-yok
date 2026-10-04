import { Ratelimit } from '@upstash/ratelimit';
import { getRedisClient, REDIS_COMMAND_TIMEOUT_MS, withRedis } from './redis';

// ── In-memory fallback ──────────────────────────────────────────────────────

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

function cleanupExpired(current: number) {
  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAt <= current) buckets.delete(key);
  }
}

function hitInMemory(
  key: string,
  limit: number,
  windowMs: number,
): { success: boolean; remaining: number; resetAt: number } {
  const current = Date.now();
  cleanupExpired(current);

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= current) {
    const resetAt = current + windowMs;
    buckets.set(key, { count: 1, resetAt });
    return { success: true, remaining: limit - 1, resetAt };
  }

  bucket.count += 1;
  buckets.set(key, bucket);

  if (bucket.count > limit) {
    return { success: false, remaining: 0, resetAt: bucket.resetAt };
  }

  return {
    success: true,
    remaining: Math.max(0, limit - bucket.count),
    resetAt: bucket.resetAt,
  };
}

// ── Upstash limiter cache ───────────────────────────────────────────────────

const upstashLimiters = new Map<string, Ratelimit>();

function getUpstashLimiter(limit: number, windowMs: number): Ratelimit | null {
  const redis = getRedisClient();
  if (!redis) return null;

  const cacheKey = `${limit}:${windowMs}`;
  if (!upstashLimiters.has(cacheKey)) {
    const windowSec = Math.ceil(windowMs / 1000);
    upstashLimiters.set(
      cacheKey,
      new Ratelimit({
        redis,
        limiter: Ratelimit.fixedWindow(limit, `${windowSec} s`),
        prefix: 'rl',
        // Kütüphanenin kendi zaman aşımı (varsayılan 5 sn) Redis komut sınırıyla uyumlu olsun.
        timeout: REDIS_COMMAND_TIMEOUT_MS + 500,
      }),
    );
  }
  return upstashLimiters.get(cacheKey)!;
}

// ── Public API ──────────────────────────────────────────────────────────────

export type RateLimitOptions = {
  /**
   * Redis cevap vermezse isteği REDDET (fail-closed). Kimlik uçları (giriş, kayıt, şifre sıfırlama/değiştirme) için:
   * Redis kesintisi kaba kuvvet denemelerine kapı açmasın. Varsayılan fail-open (içerik uçları siteyi kapatmasın).
   */
  failClosed?: boolean;
};

export async function hitFixedWindowRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  opts: RateLimitOptions = {},
): Promise<{ success: boolean; remaining: number; resetAt: number }> {
  const upstash = getUpstashLimiter(limit, windowMs);
  // Redis hiç tanımlı değil (yerel geliştirme) → instance içi sayaç.
  if (!upstash) return hitInMemory(key, limit, windowMs);

  // Redis tanımlı ama cevap vermiyor (hata / zaman aşımı / devre açık) → varsayılan FAIL-OPEN: isteği engelleme.
  // Rate limit bir koruma katmanı; Redis kesintisi siteyi kapatmamalı (instance içi sayaç da dağıtık
  // ortamda anlamsız derecede gevşek/katı olurdu). Kimlik uçları `failClosed` ile reddeder (kısa Retry-After).
  const result = await withRedis(() => upstash.limit(key), null);
  if (!result) {
    if (opts.failClosed) return { success: false, remaining: 0, resetAt: Date.now() + 60_000 };
    return { success: true, remaining: limit, resetAt: Date.now() + windowMs };
  }
  return { success: result.success, remaining: result.remaining, resetAt: result.reset };
}

export function requestIp(
  headers: Record<string, string | string[] | undefined>,
  fallbackIp: string | undefined,
): string {
  const xff = headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length > 0) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }

  if (Array.isArray(xff) && xff.length > 0) {
    const first = xff[0]?.split(',')[0]?.trim();
    if (first) return first;
  }

  return fallbackIp ?? '0.0.0.0';
}
