/**
 * Maç başına AI analiz üretim kilidi (Redis `SET NX PX`): kullanıcı isteği ile maç öncesi cron aynı maçı aynı anda
 * üretmesin (çift LLM maliyeti, ikinci kullanıcıya gereksiz kredi rezervi).
 *
 * Redis yoksa/erişilemezse kilit "alınmış" sayılır (fail-open): DB'deki `@@unique([matchId, matchStatus])` yine
 * ikinci kaydı engeller ve analiz rotası o durumda iade + kazanan analizi döner.
 */
import { randomUUID } from 'node:crypto';
import { withRedis } from '@/lib/redis';
import { cacheKeyPrefix } from '@/lib/cacheNamespace';

/** Bağlam kurma + 35 sn LLM zaman aşımı + kayıt için yeterli; süreç çökerse kilit kendiliğinden düşer. */
export const ANALYSIS_LOCK_TTL_MS = 90_000;

export const analysisLockKey = (matchId: string) => `${cacheKeyPrefix()}analysis-gen:${matchId}`;

export type AnalysisLock = { key: string; token: string };

/** Kilidi alır; başkası tutuyorsa `null`. */
export async function acquireAnalysisLock(matchId: string): Promise<AnalysisLock | null> {
  const key = analysisLockKey(matchId);
  const token = randomUUID();
  const ok = await withRedis(async (r) => (await r.set(key, token, { nx: true, px: ANALYSIS_LOCK_TTL_MS })) === 'OK', true);
  return ok ? { key, token } : null;
}

/** Yalnız kendi aldığı kilidi bırakır (süresi dolup başkası almışsa dokunmaz). */
export async function releaseAnalysisLock(lock: AnalysisLock | null): Promise<void> {
  if (!lock) return;
  await withRedis(async (r) => {
    if ((await r.get<string>(lock.key)) === lock.token) await r.del(lock.key);
    return true;
  }, true);
}
