/** Tarih şeridi + takvim rozeti mantığı — saf fonksiyonlar (saat dilimi hatasız: ISO string aritmetiği). */

export type DateStripItem = {
  iso: string;
  /** Ayın günü (1–31) */
  day: number;
  /** 0 = Pazar … 6 = Cumartesi */
  weekday: number;
  offset: number;
  isToday: boolean;
  isSelected: boolean;
};

/** Bugünün ISO tarihi (Türkiye günü — `MatchList`/`useHomeHubMatches` ile tutarlı). */
export function todayIsoIstanbul(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** `YYYY-MM-DD` + gün farkı → `YYYY-MM-DD` (UTC öğlen üzerinden, DST/timezone kaymasız). */
export function shiftIsoDate(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function isoDayOfMonth(iso: string): number {
  return Number(iso.slice(8, 10));
}

/** Bugünü merkez alan `2*radius+1` günlük şerit (varsayılan bugün ±2 = 5 gün). */
export function buildDateStrip(todayIso: string, selectedIso: string, radius = 2): DateStripItem[] {
  const items: DateStripItem[] = [];
  for (let offset = -radius; offset <= radius; offset++) {
    const iso = shiftIsoDate(todayIso, offset);
    items.push({
      iso,
      day: isoDayOfMonth(iso),
      weekday: new Date(`${iso}T12:00:00Z`).getUTCDay(),
      offset,
      isToday: offset === 0,
      isSelected: iso === selectedIso,
    });
  }
  return items;
}

/**
 * `buildDateStrip` + seçili gün şeridin dışındaysa (takvimden uzak bir gün seçilmişse)
 * onu doğru yöne ekler — kullanıcı hangi günde olduğunu şeritte hep görür.
 */
export function buildDateStripWithSelected(todayIso: string, selectedIso: string, radius = 2): DateStripItem[] {
  const strip = buildDateStrip(todayIso, selectedIso, radius);
  if (strip.some((i) => i.isSelected)) return strip;
  const offset = Math.round(
    (new Date(`${selectedIso}T12:00:00Z`).getTime() - new Date(`${todayIso}T12:00:00Z`).getTime()) / 86_400_000,
  );
  const extra: DateStripItem = {
    iso: selectedIso,
    day: isoDayOfMonth(selectedIso),
    weekday: new Date(`${selectedIso}T12:00:00Z`).getUTCDay(),
    offset,
    isToday: false,
    isSelected: true,
  };
  return offset < 0 ? [extra, ...strip] : [...strip, extra];
}
