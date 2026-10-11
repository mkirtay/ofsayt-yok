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
import { normalizeRouteLabel } from '@/server/sportmonks/routeLabel';

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
  /** Upstream isteği neden oldu: tarayıcı proxy'si mi, sunucu (SSR/API/cron) mu. */
  origin?: 'proxy' | 'server';
};

export type QuotaLevel = 'ok' | 'warning' | 'error';

const lastAlertAt = new Map<string, number>();

export function classifyQuota(remaining: number, limit = SPORTMONKS_POOL_LIMIT): QuotaLevel {
  if (remaining < limit * QUOTA_ERROR_RATIO) return 'error';
  if (remaining < limit * QUOTA_WARNING_RATIO) return 'warning';
  return 'ok';
}

/** O saat havuzu en çok tüketen rotalar (bkz. server/sportmonks/poolGuard.ts `topRoutesForHour`). */
export type QuotaRouteUsage = { route: string; calls: number };

/**
 * Bu gözlem bir Sentry olayı üretecek mi (eşik altı ve throttle süresi dolmuş) — çağıran yalnız o zaman ek bağlam
 * (en çok tüketen rotalar) toplasın. Throttle'ı ayarlamaz.
 */
export function quotaAlertDue(pool: string, remaining: number, now: number = Date.now()): boolean {
  const level = classifyQuota(remaining);
  if (level === 'ok') return false;
  const last = lastAlertAt.get(`${pool}:${level}`);
  return last === undefined || now - last >= QUOTA_ALERT_THROTTLE_MS;
}

const formatTopRoutes = (top: QuotaRouteUsage[]) => top.map((r) => `${r.route} ${r.calls}`).join(', ');

export function reportSportmonksQuota(
  obs: QuotaObservation,
  now: number = Date.now(),
  context: { topRoutes?: QuotaRouteUsage[] } = {},
): QuotaLevel {
  const level = classifyQuota(obs.remaining);

  Sentry.addBreadcrumb({
    category: 'sportmonks.quota',
    level: level === 'ok' ? 'info' : level,
    message: `havuz=${obs.pool} kalan=${obs.remaining}`,
    data: {
      pool: obs.pool,
      remaining: obs.remaining,
      resetsInSeconds: obs.resetsInSeconds,
      path: obs.path,
      ...(obs.origin ? { origin: obs.origin } : {}),
    },
  });

  if (level === 'ok') return level;

  const throttleKey = `${obs.pool}:${level}`;
  const last = lastAlertAt.get(throttleKey);
  if (last !== undefined && now - last < QUOTA_ALERT_THROTTLE_MS) return level;
  lastAlertAt.set(throttleKey, now);

  Sentry.withScope((scope) => {
    scope.setTag('sportmonks.pool', obs.pool);
    scope.setTag('sportmonks.quota_level', level);
    if (obs.origin) scope.setTag('sportmonks.origin', obs.origin);
    scope.setLevel(level);
    scope.setExtras({
      remaining: obs.remaining,
      limit: SPORTMONKS_POOL_LIMIT,
      threshold: Math.floor(SPORTMONKS_POOL_LIMIT * (level === 'error' ? QUOTA_ERROR_RATIO : QUOTA_WARNING_RATIO)),
      resetsInSeconds: obs.resetsInSeconds,
      path: obs.path,
      ...(context.topRoutes?.length ? { topRoutes: context.topRoutes } : {}),
    });
    scope.setFingerprint(['sportmonks-quota', obs.pool, level]);
    // Olayı yakalayan rota tüketen rota olmak zorunda değil: bu saatin en çok tüketenleri mesajda.
    const top = context.topRoutes?.length ? ` — bu saat en çok: ${formatTopRoutes(context.topRoutes)}` : '';
    Sentry.captureMessage(
      `Sportmonks kota düşük: ${obs.pool} havuzunda ${obs.remaining}/${SPORTMONKS_POOL_LIMIT} kaldı${top}`,
      level,
    );
  });
  return level;
}

/**
 * Sportmonks hız sınırı (429) — havuz soğumaya girdiğinde instance başına TEK olay (bkz. server/sportmonks/poolGuard.ts).
 * Soğuma boyunca istek atılmadığı için her tick / render ayrı bir `SportmonksHttpError` üretmez.
 */
export function reportSportmonksRateLimited(info: { pool: string; path: string; cooldownSeconds: number; route: string; origin?: 'proxy' | 'server' }): void {
  Sentry.withScope((scope) => {
    scope.setTag('sportmonks.pool', info.pool);
    scope.setTag('sportmonks.quota_level', 'rate_limited');
    if (info.origin) scope.setTag('sportmonks.origin', info.origin);
    scope.setLevel('warning');
    scope.setExtras({ path: info.path, cooldownSeconds: info.cooldownSeconds, route: info.route });
    scope.setFingerprint(['sportmonks-rate-limited', info.pool]);
    Sentry.captureMessage(`Sportmonks hız sınırı: ${info.pool} havuzu ${info.cooldownSeconds} sn bekletiliyor`, 'warning');
  });
}

/**
 * Upstream isteğini başlatan rota (kota ölçümü için): Sentry'nin istek kapsamındaki işlem adı
 * (`POST /api/admin/gundem/bot-tick`, `getStaticProps (/teknik-direktor/[slug])`), yoksa istek yolu, o da yoksa
 * `unknown`. Her iki durumda `normalizeRouteLabel` (maç slug'ı → `[slug]`, sayısal segment → `:id`).
 */
export function currentRequestRoute(): string {
  try {
    const data = Sentry.getIsolationScope().getScopeData();
    if (data.transactionName) return normalizeRouteLabel(data.transactionName);
    const req = (data.sdkProcessingMetadata as { normalizedRequest?: { method?: string; url?: string } } | undefined)?.normalizedRequest;
    if (req?.url) return normalizeRouteLabel(`${req.method ?? 'GET'} ${new URL(req.url, 'http://x').pathname}`);
  } catch {
    // Sentry yoksa ölçüm yine çalışır
  }
  return 'unknown';
}

/** Test yardımcısı — throttle durumunu sıfırlar. */
export function resetQuotaAlertThrottle(): void {
  lastAlertAt.clear();
}
