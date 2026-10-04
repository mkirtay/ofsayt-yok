import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * `Authorization: Bearer $CRON_SECRET` kontrolü — sabit zamanlı (`timingSafeEqual`; uzunluk da sızmasın diye iki
 * tarafın SHA-256 özeti karşılaştırılır). `CRON_SECRET` tanımsızsa her zaman false. Edge (middleware) sürümü:
 * lib/constantTimeEqual.ts.
 */
export function isCronAuthorization(authorization: string | undefined | null, secret = process.env.CRON_SECRET): boolean {
  if (!secret || typeof authorization !== 'string') return false;
  const digest = (v: string) => createHash('sha256').update(v).digest();
  return timingSafeEqual(digest(authorization), digest(`Bearer ${secret}`));
}
