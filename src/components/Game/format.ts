/** Tahmin oyunu gösterim yardımcıları (saf). Saat hep Türkiye saatiyle gösterilir. */
type T = (key: string, opts?: Record<string, unknown>) => string;

const fmtCache = new Map<string, Intl.DateTimeFormat>();

export function formatKickoff(iso: string, locale: string): string {
  const key = locale === 'en' ? 'en-GB' : 'tr-TR';
  let f = fmtCache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(key, { timeZone: 'Europe/Istanbul', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    fmtCache.set(key, f);
  }
  return f.format(new Date(iso));
}

/** "2 g 3 sa" / "3 sa 12 dk" / "12 dk" (en az 1 dk). */
export function formatLeft(ms: number, t: T): string {
  const totalMin = Math.max(1, Math.ceil(ms / 60_000));
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  if (d > 0) return t('time.d', { d, h });
  if (h > 0) return t('time.h', { h, m });
  return t('time.m', { m });
}

/** "2026-W42" → 42 */
export function weekNumber(weekKey: string): number {
  return Number(weekKey.slice(-2));
}

const dayFmt = new Map<string, Intl.DateTimeFormat>();

/** "2026-10-19" → "19 Ekim Pazartesi" (gün anahtarı İstanbul tarihi; öğlen UTC ile biçimlenir, gün kaymaz). */
export function formatDayLabel(dayKey: string, locale: string): string {
  const key = locale === 'en' ? 'en-GB' : 'tr-TR';
  let f = dayFmt.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(key, { timeZone: 'Europe/Istanbul', day: 'numeric', month: 'long', weekday: 'long' });
    dayFmt.set(key, f);
  }
  return f.format(new Date(`${dayKey}T12:00:00Z`));
}
