import { Ratelimit } from '@upstash/ratelimit';
import { getRedisClient } from './redis';

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
      }),
    );
  }
  return upstashLimiters.get(cacheKey)!;
}

// ── Public API ──────────────────────────────────────────────────────────────

export async function hitFixedWindowRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<{ success: boolean; remaining: number; resetAt: number }> {
  const upstash = getUpstashLimiter(limit, windowMs);

  if (upstash) {
    try {
      const result = await upstash.limit(key);
      return {
        success: result.success,
        remaining: result.remaining,
        resetAt: result.reset,
      };
    } catch {
      // Redis bağlantı hatası → in-memory fallback
    }
  }

  return hitInMemory(key, limit, windowMs);
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
