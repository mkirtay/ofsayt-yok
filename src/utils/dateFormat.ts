const TR_TZ = 'Europe/Istanbul';

/** "HH:MM" (UTC) -> "HH:MM" (TR) cevirisi; tarih varsa daha dogru sonuc verir */
export function utcTimeToTr(time: string, isoDate?: string): string {
  const hm = time.trim();
  if (!/^\d{2}:\d{2}$/.test(hm)) return hm;
  const dateStr = isoDate?.trim() || '2026-01-01';
  const d = new Date(`${dateStr}T${hm}:00Z`);
  if (Number.isNaN(d.getTime())) return hm;
  return d.toLocaleTimeString('tr-TR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: TR_TZ,
  });
}

/** ISO tarih (YYYY-MM-DD) -> TR gosterim (GG.AA.YYYY) */
export function isoDateToTr(isoDate: string): string {
  const p = isoDate.trim().split('-');
  return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : isoDate;
}
