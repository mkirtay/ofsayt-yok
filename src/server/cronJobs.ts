/**
 * Zamanlanmış işler (cron-job.org 15 dk + GitHub Actions yedek + Vercel günlük): çakışma kilidi, nabız, boşluk uyarısı.
 *
 * - Kilit: iş başına Redis `SET NX PX` — GitHub ve cron-job.org aynı anda gelirse ikincisi "zaten çalışıyor" alır.
 *   Redis yoksa/erişilemezse kilit alınmış sayılır (fail-open): işler zaten idempotent (tek üretim, değerlendirilmiş
 *   kayıt atlanır).
 * - Nabız: her çalışmanın sonunda `lastRunAt`, süre, başarı ve özet Redis'e yazılır → /ai-istatistikleri admin bandı.
 * - Uyarı: çalışma başlarken önceki nabız 45 dk'dan eskiyse Sentry warning; çalışma hata verirse Sentry error.
 * Secret, başlık ya da istek gövdesi hiçbir yere yazılmaz.
 */
import { randomUUID } from 'node:crypto';
import * as Sentry from '@sentry/nextjs';
import { withRedis } from '@/lib/redis';
import { cacheKeyPrefix } from '@/lib/cacheNamespace';

export type CronJobName = 'evaluate-predictions' | 'analysis-pregenerate';
export const CRON_JOBS: readonly CronJobName[] = ['evaluate-predictions', 'analysis-pregenerate'];

/** 15 dk'lık zamanlamada 3 çalışma kaçırılmış demek. */
export const CRON_STALE_AFTER_MS = 45 * 60_000;

/** Kilit süresi = fonksiyonun azami süresi; süreç çökerse kilit kendiliğinden düşer. */
export const CRON_LOCK_TTL_MS: Record<CronJobName, number> = {
  'evaluate-predictions': 300_000,
  'analysis-pregenerate': 120_000,
};

export type CronHeartbeat = {
  lastRunAt: string;
  ms: number;
  ok: boolean;
  /** Sayısal özet (üretilen / atlanan / değerlendirilen / hata …). */
  summary: Record<string, number>;
  /** Tetikleyen: cron (Bearer) ya da admin (elle). */
  trigger: 'cron' | 'admin';
};

const lockKey = (job: CronJobName) => `${cacheKeyPrefix()}cron-lock:${job}`;
const heartbeatKey = (job: CronJobName) => `${cacheKeyPrefix()}cron-heartbeat:${job}`;

export type CronLock = { key: string; token: string };

export async function acquireCronLock(job: CronJobName): Promise<CronLock | null> {
  const key = lockKey(job);
  const token = randomUUID();
  const ok = await withRedis(async (r) => (await r.set(key, token, { nx: true, px: CRON_LOCK_TTL_MS[job] })) === 'OK', true);
  return ok ? { key, token } : null;
}

export async function releaseCronLock(lock: CronLock | null): Promise<void> {
  if (!lock) return;
  await withRedis(async (r) => {
    if ((await r.get<string>(lock.key)) === lock.token) await r.del(lock.key);
    return true;
  }, true);
}

export async function readCronHeartbeat(job: CronJobName): Promise<CronHeartbeat | null> {
  return withRedis(async (r) => (await r.get<CronHeartbeat>(heartbeatKey(job))) ?? null, null);
}

export async function readCronHeartbeats(): Promise<Record<CronJobName, CronHeartbeat | null>> {
  const [evaluate, pregen] = await Promise.all(CRON_JOBS.map(readCronHeartbeat));
  return { 'evaluate-predictions': evaluate ?? null, 'analysis-pregenerate': pregen ?? null };
}

async function writeCronHeartbeat(job: CronJobName, hb: CronHeartbeat): Promise<void> {
  // 30 gün: iş tamamen durursa da admin bandı son bilinen çalışmayı gösterir.
  await withRedis(async (r) => {
    await r.set(heartbeatKey(job), hb, { ex: 30 * 24 * 3600 });
    return true;
  }, true);
}

/** Önceki nabız 45 dk'dan eskiyse (ya da hiç yoksa değil — ilk çalışma) Sentry warning. */
export function staleGapMs(previous: CronHeartbeat | null, now: number): number | null {
  if (!previous) return null;
  const gap = now - Date.parse(previous.lastRunAt);
  return Number.isFinite(gap) && gap > CRON_STALE_AFTER_MS ? gap : null;
}

/**
 * İşi kilit altında çalıştırır; nabzı yazar, hata/boşlukta Sentry'ye bildirir. Kilit alınamazsa `busy`.
 * `summarize` sonucu sayısal özete çevirir (heartbeat + log).
 */
export async function runCronJob<T>(
  job: CronJobName,
  trigger: CronHeartbeat['trigger'],
  work: () => Promise<T>,
  summarize: (result: T) => Record<string, number>,
  lock?: CronLock | null,
): Promise<{ status: 'busy' } | { status: 'done'; result: T } | { status: 'failed'; error: unknown }> {
  const held = lock === undefined ? await acquireCronLock(job) : lock;
  if (!held) return { status: 'busy' };
  const started = Date.now();
  try {
    const gap = staleGapMs(await readCronHeartbeat(job), started);
    if (gap != null) {
      Sentry.captureMessage(`Zamanlanmış iş ${Math.round(gap / 60_000)} dk çalışmamış: ${job}`, {
        level: 'warning',
        tags: { 'cron.job': job },
      });
    }
    const result = await work();
    const summary = summarize(result);
    await writeCronHeartbeat(job, { lastRunAt: new Date().toISOString(), ms: Date.now() - started, ok: true, summary, trigger });
    console.log(JSON.stringify({ event: 'cron-run', job, trigger, ms: Date.now() - started, ok: true, ...summary }));
    return { status: 'done', result };
  } catch (error) {
    await writeCronHeartbeat(job, { lastRunAt: new Date().toISOString(), ms: Date.now() - started, ok: false, summary: {}, trigger });
    console.error(JSON.stringify({ event: 'cron-run', job, trigger, ms: Date.now() - started, ok: false }));
    Sentry.captureException(error, { level: 'error', tags: { 'cron.job': job, context: `cron-${job}` } });
    return { status: 'failed', error };
  } finally {
    await releaseCronLock(held);
  }
}

/** Bearer CRON_SECRET kontrolü (değer hiçbir yere yazılmaz). */
export function isCronRequest(authorization: string | undefined): boolean {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && authorization === `Bearer ${secret}`;
}
