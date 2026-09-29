/** Boş gün ekranı: takip edilen liglerin sıradaki maç günlerinden gösterilecekleri seçer ve biçimler. */

export type LeagueDay = { leagueId: number; date: string };

/**
 * Filtre yoksa (Tümü) en yakın tek gün; filtre varsa filtredeki liglerin her biri (tarihe göre).
 * Filtredeki bir lig takip edilen kümede değilse (özel "Liglerim" seçimi) listede görünmez.
 */
export function pickNextMatchDays(entries: readonly LeagueDay[], leagueIds: ReadonlySet<number> | null): LeagueDay[] {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date) || a.leagueId - b.leagueId);
  if (!leagueIds) return sorted.slice(0, 1);
  return sorted.filter((e) => leagueIds.has(e.leagueId));
}

/** "2026-10-09" → "9 Ekim" / "9 October" (gün UTC öğlen üzerinden, saat dilimi kaymasız). */
export function formatDayMonth(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'tr-TR', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(
    new Date(`${iso}T12:00:00Z`),
  );
}

/** Türkçe bulunma eki ay adına göre: "9 Ekim'de", "3 Mart'ta", "12 Nisan'da". */
const TR_MONTH_LOCATIVE = ["'ta", "'ta", "'ta", "'da", "'ta", "'da", "'da", "'ta", "'de", "'de", "'da", "'ta"];

export function formatDayMonthLocative(iso: string, locale: string): string {
  const base = formatDayMonth(iso, locale);
  if (locale === 'en') return base;
  const month = Number(iso.slice(5, 7)) - 1;
  return `${base}${TR_MONTH_LOCATIVE[month] ?? ''}`;
}
