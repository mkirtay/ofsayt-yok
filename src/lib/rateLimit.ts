type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

function nowMs(): number {
  return Date.now();
}

function cleanupExpired(current: number) {
  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAt <= current) {
      buckets.delete(key);
    }
  }
}

export function hitFixedWindowRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): { success: boolean; remaining: number; resetAt: number } {
  const current = nowMs();
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