/** Tarih gruplu fikstür başlığının metni — "Bugün · 23 Eylül Salı" gibi. */

const TZ = 'Europe/Istanbul';

const LOCALE_TAGS: Record<string, string> = { tr: 'tr-TR', en: 'en-GB' };

/** `YYYY-MM-DD` → "23 Eylül Salı" / "23 September Tuesday" (TR saat dilimi). */
export function formatFixtureDate(isoDate: string, locale: string): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return isoDate;
  return new Intl.DateTimeFormat(LOCALE_TAGS[locale] ?? LOCALE_TAGS.tr, {
    day: 'numeric',
    month: 'long',
    weekday: 'long',
    timeZone: TZ,
  })
    .format(d)
    .replace(/,/g, '');
}

/** `YYYY-MM-DD` + gün farkı → yeni `YYYY-MM-DD` (UTC öğlen üzerinden; saat dilimi kaymasız). */
function shift(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Bugün/yarın ise o ön eki de ekler: "Bugün · 23 Eylül Salı". */
export function fixtureDateHeading(
  isoDate: string,
  todayIso: string,
  locale: string,
  labels: { today: string; tomorrow: string },
): string {
  const formatted = formatFixtureDate(isoDate, locale);
  if (isoDate === todayIso) return `${labels.today} · ${formatted}`;
  if (isoDate === shift(todayIso, 1)) return `${labels.tomorrow} · ${formatted}`;
  return formatted;
}
