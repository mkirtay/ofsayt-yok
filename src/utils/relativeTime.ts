type TFn = (key: string, opts?: Record<string, unknown>) => string;

/**
 * "az önce / 5 dk önce / 3 saat önce / 2 gün önce". `t` herhangi bir namespace'in çevirisi olabilir
 * (anahtarlar `common:relativeTime.*` ile tam nitelenir). `now` yalnızca test içindir.
 */
export function formatRelativeTime(iso: string, t: TFn, now: number = Date.now()): string {
  const mins = Math.floor((now - new Date(iso).getTime()) / 60_000);
  if (!(mins >= 1)) return t('common:relativeTime.justNow'); // < 1 dk, gelecek tarih ve geçersiz tarih
  if (mins < 60) return t('common:relativeTime.minutesAgo', { count: mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t('common:relativeTime.hoursAgo', { count: hours });
  return t('common:relativeTime.daysAgo', { count: Math.floor(hours / 24) });
}
