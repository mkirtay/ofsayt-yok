/**
 * Zamanlanmış işler (cron-job.org 15 dk + GitHub Actions yedek + Vercel günlük): çakışma kilidi, nabız, boşluk uyarısı.
 *
 * - Kilit: iş başına Redis `SET NX PX` — GitHub ve cron-job.org aynı anda gelirse ikincisi "zaten çalışıyor" alır.
 *   Redis yoksa/erişilemezse kilit alınmış sayılır (fail-open): işler zaten idempotent (tek üretim, değerlendirilmiş
 *   kayıt atlanır).
 * - Nabız: her tick'te (iş olmasa da) `lastRunAt` yazılır → /ai-istatistikleri admin bandı. Cron (202) yolunda tick
 *   nabzı yanıttan ÖNCE, eşzamanlı yazılır: arka plan işi Vercel tarafından dondurulsa bile "son çalışma" güncel kalır.
 *   İş bitince süre/başarı/özet eklenir; özet gerçek iş içeriyorsa (`evaluated`/`generated` > 0) `lastWorkAt` ilerler.
 * - Uyarı: tick başlarken önceki nabız 45 dk'dan eskiyse Sentry warning; çalışma hata verirse Sentry error.
 * Secret, başlık ya da istek gövdesi hiçbir yere yazılmaz.
 */
import { randomUUID } from 'node:crypto';
import * as Sentry from '@sentry/nextjs';
import { withRedis } from '@/lib/redis';
import { cacheKeyPrefix } from '@/lib/cacheNamespace';
import { isCronAuthorization } from '@/lib/cronSecret';

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
  /** Son tick (iş olsun olmasın). Bayatlık uyarısı yalnız buna bakar. */
  lastRunAt: string;
  /** Son gerçek iş (değerlendirme/üretim yapılan çalışma); hiç yoksa yok. */
  lastWorkAt?: string;
  /** `started`: tick kabul edildi, iş sürüyor; `done`: iş bitti (ok/summary dolu). */
  phase?: 'started' | 'done';
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

/** Özet gerçek iş içeriyor mu (değerlendirilen ya da üretilen var)? */
export function summaryHasWork(summary: Record<string, number>): boolean {
  return (summary.evaluated ?? 0) > 0 || (summary.generated ?? 0) > 0;
}

export type CronTick = { previous: CronHeartbeat | null; at: number };

/**
 * Tick nabzı: `lastRunAt` = şimdi, `lastWorkAt` öncekinden taşınır; önceki nabız eskiyse Sentry warning.
 * Cron yolunda 202'den ÖNCE await edilir (`runCronJob`'a `ticked` olarak verilir); admin yolunda `runCronJob` kendisi çağırır.
 */
export async function recordCronTick(job: CronJobName, trigger: CronHeartbeat['trigger']): Promise<CronTick> {
  const at = Date.now();
  const previous = await readCronHeartbeat(job);
  const gap = staleGapMs(previous, at);
  if (gap != null) {
    Sentry.captureMessage(`Zamanlanmış iş ${Math.round(gap / 60_000)} dk çalışmamış: ${job}`, {
      level: 'warning',
      tags: { 'cron.job': job },
    });
  }
  await writeCronHeartbeat(job, { lastRunAt: new Date(at).toISOString(), lastWorkAt: previous?.lastWorkAt, phase: 'started', ms: 0, ok: true, summary: {}, trigger });
  return { previous, at };
}

/**
 * İşi kilit altında çalıştırır; tick + bitiş nabzını yazar, hatada Sentry'ye bildirir. Kilit alınamazsa `busy`.
 * `summarize` sonucu sayısal özete çevirir (heartbeat + log). `opts.lock`: önceden alınmış kilit; `opts.ticked`:
 * tick nabzı zaten yazıldı (cron 202 yolu) — yeniden yazılmaz, önceki `lastWorkAt` oradan taşınır.
 */
export async function runCronJob<T>(
  job: CronJobName,
  trigger: CronHeartbeat['trigger'],
  work: () => Promise<T>,
  summarize: (result: T) => Record<string, number>,
  opts: { lock?: CronLock | null; ticked?: CronTick } = {},
): Promise<{ status: 'busy' } | { status: 'done'; result: T } | { status: 'failed'; error: unknown }> {
  const held = opts.lock === undefined ? await acquireCronLock(job) : opts.lock;
  if (!held) return { status: 'busy' };
  const tick = opts.ticked ?? (await recordCronTick(job, trigger));
  const started = Date.now();
  const lastRunAt = new Date(tick.at).toISOString();
  try {
    const result = await work();
    const summary = summarize(result);
    const lastWorkAt = summaryHasWork(summary) ? new Date().toISOString() : tick.previous?.lastWorkAt;
    await writeCronHeartbeat(job, { lastRunAt, lastWorkAt, phase: 'done', ms: Date.now() - started, ok: true, summary, trigger });
    console.log(JSON.stringify({ event: 'cron-run', job, trigger, ms: Date.now() - started, ok: true, ...summary }));
    return { status: 'done', result };
  } catch (error) {
    await writeCronHeartbeat(job, { lastRunAt, lastWorkAt: tick.previous?.lastWorkAt, phase: 'done', ms: Date.now() - started, ok: false, summary: {}, trigger });
    console.error(JSON.stringify({ event: 'cron-run', job, trigger, ms: Date.now() - started, ok: false }));
    Sentry.captureException(error, { level: 'error', tags: { 'cron.job': job, context: `cron-${job}` } });
    return { status: 'failed', error };
  } finally {
    await releaseCronLock(held);
  }
}

/** Bearer CRON_SECRET kontrolü (değer hiçbir yere yazılmaz; sabit zamanlı — lib/cronSecret.ts). */
export function isCronRequest(authorization: string | undefined): boolean {
  return isCronAuthorization(authorization);
}
