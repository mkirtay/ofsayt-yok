/**
 * Tek bir kupanın/ligin fikstürünü GÜNE göre gruplar — ana sayfadaki maç listesi UEFA kupalarında
 * tek bir tarihe sabit kalmasın, maç haftası boyunca yayılan maçlar tarih etiketiyle görünsün diye.
 *
 * Yurt içi ligler bunu KULLANMAZ: orada liste eskisi gibi seçili günün maçlarını lig başlıklarıyla
 * gösterir (bkz. `MatchHubPage`).
 *
 * SAAT DİLİMİ: Sportmonks `starting_at` UTC'dir (`match.date` = UTC günü, `match.scheduled` = UTC saati),
 * satırdaki saat ise `utcTimeToTr` ile TR'ye çevrilir. Gruplama da TR gününe göre yapılır — aksi hâlde
 * 21:00 UTC (00:00 TR) bir maç bir önceki günün başlığı altında "00:00" olarak görünürdü.
 */

import type { Match } from '@/models/liveScore';

export type FixtureDateGroup = {
  /** TR gününe göre `YYYY-MM-DD` */
  date: string;
  matches: Match[];
};

const TR_TZ = 'Europe/Istanbul';

const TR_DAY_FMT = new Intl.DateTimeFormat('en-CA', {
  timeZone: TR_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Maçın TR takvimindeki günü. Saat yoksa `match.date` olduğu gibi kullanılır (kaydırmak tahmin olurdu). */
export function istanbulMatchDate(match: Match): string {
  const date = match.date?.trim().slice(0, 10) ?? '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return '';
  const time = match.scheduled?.trim() ?? '';
  if (!/^\d{2}:\d{2}$/.test(time)) return date;
  const d = new Date(`${date}T${time}:00Z`);
  if (Number.isNaN(d.getTime())) return date;
  return TR_DAY_FMT.format(d);
}

/** Gün içi sıra: önce saat (UTC sıralaması TR ile aynı), eşitse ev sahibi adı. */
function compareWithinDay(a: Match, b: Match): number {
  const ta = a.scheduled?.trim() ?? '';
  const tb = b.scheduled?.trim() ?? '';
  if (ta !== tb) return ta.localeCompare(tb);
  return (a.home?.name ?? '').localeCompare(b.home?.name ?? '', 'tr');
}

export type BuildFixtureDateGroupsOptions = {
  /** TR günü (`todayIsoIstanbul()`) — bundan önceki maçlar elenir. */
  todayIso: string;
  /**
   * Yaklaşan hiç maç kalmadıysa (ör. sezon arası) son oynanan bu kadar günü göster —
   * boş bir liste yerine kupanın en son maç haftası. 0 = kapalı.
   */
  fallbackPastDays?: number;
};

/**
 * Bugün ve sonrasındaki maçları güne göre gruplar (gün sırası artan).
 * Yaklaşan maç yoksa `fallbackPastDays` kadar son günü (yine artan sırada) döndürür.
 */
export function buildFixtureDateGroups(
  matches: Match[],
  { todayIso, fallbackPastDays = 3 }: BuildFixtureDateGroupsOptions,
): FixtureDateGroup[] {
  const byDate = new Map<string, Match[]>();
  for (const m of matches) {
    const date = istanbulMatchDate(m);
    if (!date) continue;
    const bucket = byDate.get(date);
    if (bucket) bucket.push(m);
    else byDate.set(date, [m]);
  }

  const allDates = [...byDate.keys()].sort();
  let dates = allDates.filter((d) => d >= todayIso);
  if (dates.length === 0 && fallbackPastDays > 0) {
    dates = allDates.slice(-fallbackPastDays);
  }

  return dates.map((date) => ({
    date,
    matches: [...byDate.get(date)!].sort(compareWithinDay),
  }));
}
