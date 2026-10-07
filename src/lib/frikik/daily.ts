/**
 * "Günün frikiği": herkes aynı seviye dizisini oynar. Gün TÜRKİYE saatine göre (Europe/Istanbul = UTC+3; 2016'dan beri
 * yaz saati yok → sabit ofset, Intl gerekmez); tohum gün numarasından türetilir (Math.random yok). Tarih/saat yalnız
 * burada, bileşende ve sunucu doğrulamasında; simülasyon (sim.ts) saat bilmez.
 *
 * Skor tablosu da bu günü kullanır: gün anahtarı "YYYY-MM-DD", ay anahtarı "YYYY-MM" (TR takvimi). Gece yarısından
 * hemen sonra biten koşular için kısa tolerans (`DAY_GRACE_MS`): önceki güne başlanmış koşu o güne yazılır.
 */
const TR_OFFSET_MS = 3 * 3_600_000;
const DAY_MS = 86_400_000;

/** Gece yarısından sonra önceki günün koşusunun kabul edildiği süre. */
export const DAY_GRACE_MS = 10 * 60_000;

/** TR gününün numarası (1970-01-01 TR = 0). */
export function turkeyDay(nowMs: number): number {
  return Math.floor((nowMs + TR_OFFSET_MS) / DAY_MS);
}

/** Günün tohumu (32 bit). */
export function dailySeed(day: number): number {
  return (Math.imul(day | 0, 0x9e3779b1) ^ 0x6f4a7c15) >>> 0;
}

/** Gün numarası → "YYYY-MM-DD" (TR takvimi). */
export function dayLabel(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

const DAY_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** "YYYY-MM-DD" → gün numarası; biçim bozuksa / takvimde olmayan tarihse null. 2026–2099 aralığı (adres uzayı sınırlı). */
export function parseDayKey(raw: unknown): number | null {
  if (typeof raw !== 'string') return null;
  const m = DAY_KEY_RE.exec(raw);
  if (!m) return null;
  const y = Number(m[1]);
  if (y < 2026 || y > 2099) return null;
  const ms = Date.UTC(y, Number(m[2]) - 1, Number(m[3]));
  const day = Math.floor(ms / DAY_MS);
  return dayLabel(day) === raw ? day : null;
}

/** "YYYY-MM-DD" → "YYYY-MM". */
export function monthKey(dayKey: string): string {
  return dayKey.slice(0, 7);
}

/** Sunucunun bugünü ("YYYY-MM-DD") ve bu ayı. */
export function todayKey(nowMs: number): string {
  return dayLabel(turkeyDay(nowMs));
}

/**
 * İstemcinin bildirdiği gün kabul edilir mi? Bugün her zaman; dün yalnız gece yarısından sonraki ilk `DAY_GRACE_MS`
 * içinde (koşu dünden başlamış, şimdi bitmiş). Daha eski / gelecek gün reddedilir.
 */
export function isAcceptedDay(day: number, nowMs: number): boolean {
  const today = turkeyDay(nowMs);
  if (day === today) return true;
  if (day === today - 1) return nowMs + TR_OFFSET_MS - today * DAY_MS < DAY_GRACE_MS;
  return false;
}
