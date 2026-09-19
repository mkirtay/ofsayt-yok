/**
 * Sportmonks kota izleme (Faz 6) — her GERÇEK upstream isteğinden sonra dönen
 * `rate_limit` bilgisini Sentry'ye taşır.
 *
 * - Her istek: `sportmonks.quota` kategorili bir breadcrumb (havuz adı + kalan).
 * - `remaining` havuz limitinin %10'unun altına düşünce: `warning` seviyesinde,
 *   %2'nin altına düşünce `error` seviyesinde GERÇEK bir Sentry event'i
 *   (`captureMessage`) — sessiz bir log değil, alarm kuralına bağlanabilir.
 *
 * Havuz limiti (2500/saat): Pass 1-5'te her havuzun (Fixture/League/Standing/
 * Topscorer/PlayerTeam/Type/PlayerStatistic) İLK isteğinde `remaining` 2499
 * görüldü — yani havuz başına saatlik limit 2500. Plan değişirse bu sabit
 * güncellenmeli (rate_limit response'u limitin kendisini vermiyor).
 */
import * as Sentry from '@sentry/nextjs';

export const SPORTMONKS_POOL_LIMIT = 2500;
export const QUOTA_WARNING_RATIO = 0.1;
export const QUOTA_ERROR_RATIO = 0.02;
/** Aynı havuz+seviye için event spam'ini önler (kota düşükken her istek event üretmesin). */
export const QUOTA_ALERT_THROTTLE_MS = 60_000;

export type QuotaObservation = {
  pool: string;
  remaining: number;
  resetsInSeconds: number;
  path: string;
};

export type QuotaLevel = 'ok' | 'warning' | 'error';

const lastAlertAt = new Map<string, number>();

export function classifyQuota(remaining: number, limit = SPORTMONKS_POOL_LIMIT): QuotaLevel {
  if (remaining < limit * QUOTA_ERROR_RATIO) return 'error';
  if (remaining < limit * QUOTA_WARNING_RATIO) return 'warning';
  return 'ok';
}

export function reportSportmonksQuota(obs: QuotaObservation, now: number = Date.now()): QuotaLevel {
  const level = classifyQuota(obs.remaining);

  Sentry.addBreadcrumb({
    category: 'sportmonks.quota',
    level: level === 'ok' ? 'info' : level,
    message: `havuz=${obs.pool} kalan=${obs.remaining}`,
    data: { pool: obs.pool, remaining: obs.remaining, resetsInSeconds: obs.resetsInSeconds, path: obs.path },
  });

  if (level === 'ok') return level;

  const throttleKey = `${obs.pool}:${level}`;
  const last = lastAlertAt.get(throttleKey);
  if (last !== undefined && now - last < QUOTA_ALERT_THROTTLE_MS) return level;
  lastAlertAt.set(throttleKey, now);

  Sentry.withScope((scope) => {
    scope.setTag('sportmonks.pool', obs.pool);
    scope.setTag('sportmonks.quota_level', level);
    scope.setLevel(level);
    scope.setExtras({
      remaining: obs.remaining,
      limit: SPORTMONKS_POOL_LIMIT,
      threshold: Math.floor(SPORTMONKS_POOL_LIMIT * (level === 'error' ? QUOTA_ERROR_RATIO : QUOTA_WARNING_RATIO)),
      resetsInSeconds: obs.resetsInSeconds,
      path: obs.path,
    });
    scope.setFingerprint(['sportmonks-quota', obs.pool, level]);
    Sentry.captureMessage(
      `Sportmonks kota düşük: ${obs.pool} havuzunda ${obs.remaining}/${SPORTMONKS_POOL_LIMIT} kaldı`,
      level,
    );
  });
  return level;
}

/** Test yardımcısı — throttle durumunu sıfırlar. */
export function resetQuotaAlertThrottle(): void {
  lastAlertAt.clear();
}
