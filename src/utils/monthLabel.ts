const MONTH_FMT = new Intl.DateTimeFormat('tr-TR', { month: 'long', year: 'numeric', timeZone: 'UTC' });

/** "2026-11" → "Kasım 2026" (AI aylık isabet raporu). Geçersizse girdi. */
export function monthLabel(month: string): string {
  return /^\d{4}-\d{2}$/.test(month) ? MONTH_FMT.format(new Date(`${month}-15T00:00:00Z`)) : month;
}
