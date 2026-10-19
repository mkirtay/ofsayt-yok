/**
 * Tahmin oyunu takvimi. Hafta = TÜRKİYE takvimine göre ISO haftası: Pazartesi 00:00 – Pazar 23:59 (Europe/Istanbul).
 * TR 2016'dan beri yaz saati uygulamıyor → sabit UTC+3 (lib/frikik/daily.ts ile aynı yaklaşım). Saat bilgisi yalnız
 * hafta sınırı ve gösterim içindir; kilit maç başına `GameMatch.kickoffAt` (UTC) ile veritabanı saatinde.
 *
 * Anahtarlar: hafta "2026-W42", sezon "2026-27" (Temmuz–Haziran; haftanın Pazartesi'sine göre).
 */
const TR_OFFSET_MS = 3 * 3_600_000;
const DAY_MS = 86_400_000;
const WEEK_KEY_RE = /^(\d{4})-W(\d{2})$/;

/** TR gününün numarası (1970-01-01 TR = 0; o gün Perşembe). */
function trDayNumber(ms: number): number {
  return Math.floor((ms + TR_OFFSET_MS) / DAY_MS);
}

/** Pazartesi = 0 … Pazar = 6. */
function weekday(dayNum: number): number {
  return (((dayNum + 3) % 7) + 7) % 7;
}

function utcYear(dayNum: number): number {
  return new Date(dayNum * DAY_MS).getUTCFullYear();
}

/** Yılın 1. ISO haftasının Pazartesi'si (4 Ocak her zaman 1. haftadadır). */
function isoWeekOneMonday(year: number): number {
  const jan4 = Math.floor(Date.UTC(year, 0, 4) / DAY_MS);
  return jan4 - weekday(jan4);
}

/** O anın TR haftası. */
export function weekKeyOf(ms: number): string {
  const day = trDayNumber(ms);
  const monday = day - weekday(day);
  const year = utcYear(monday + 3); // ISO: haftanın Perşembe'si yılı belirler
  const week = Math.floor((monday - isoWeekOneMonday(year)) / 7) + 1;
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/** "2026-W42" → Pazartesi gün numarası; biçim bozuk / yılda olmayan hafta / 2026–2099 dışı → null. */
function mondayOf(weekKey: unknown): number | null {
  if (typeof weekKey !== 'string') return null;
  const m = WEEK_KEY_RE.exec(weekKey);
  if (!m) return null;
  const year = Number(m[1]);
  const week = Number(m[2]);
  if (year < 2026 || year > 2099 || week < 1 || week > 53) return null;
  const monday = isoWeekOneMonday(year) + (week - 1) * 7;
  return utcYear(monday + 3) === year ? monday : null;
}

export function isWeekKey(value: unknown): value is string {
  return mondayOf(value) != null;
}

/** Haftanın UTC sınırları: [startsAt, endsAt) — TR Pazartesi 00:00 ve sonraki Pazartesi 00:00. */
export function weekRange(weekKey: string): { startsAt: Date; endsAt: Date } | null {
  const monday = mondayOf(weekKey);
  if (monday == null) return null;
  const start = monday * DAY_MS - TR_OFFSET_MS;
  return { startsAt: new Date(start), endsAt: new Date(start + 7 * DAY_MS) };
}

/** n hafta sonrası / öncesi. */
export function shiftWeek(weekKey: string, n: number): string | null {
  const monday = mondayOf(weekKey);
  if (monday == null) return null;
  return weekKeyOf((monday + n * 7) * DAY_MS - TR_OFFSET_MS);
}

/** Sezon anahtarı: Temmuz–Haziran ("2026-27"); haftanın Pazartesi'sine göre. */
export function seasonOf(weekKey: string): string | null {
  const monday = mondayOf(weekKey);
  if (monday == null) return null;
  const d = new Date(monday * DAY_MS);
  const y = d.getUTCMonth() >= 6 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
  return `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
}

const SEASON_RE = /^(\d{4})-(\d{2})$/;

export function isSeasonKey(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const m = SEASON_RE.exec(value);
  if (!m) return false;
  const y = Number(m[1]);
  return y >= 2025 && y <= 2099 && Number(m[2]) === (y + 1) % 100;
}

/** Bir anın hafta içinde olup olmadığı. */
export function isInWeek(weekKey: string, at: Date): boolean {
  const r = weekRange(weekKey);
  return !!r && at >= r.startsAt && at < r.endsAt;
}

/**
 * Seri: yayındaki haftalar (yeniden eskiye) içinde art arda tahmin yapılan hafta sayısı. İçinde bulunulan hafta henüz
 * tahminsizse seriyi bozmaz (bir önceki haftadan sayılır); yayınlanmamış (oyunsuz) haftalar seriyi bozmaz.
 */
export function weekStreak(publishedDesc: readonly string[], predicted: ReadonlySet<string>, currentKey: string | null): number {
  let n = 0;
  for (const key of publishedDesc) {
    if (predicted.has(key)) n++;
    else if (key === currentKey && n === 0) continue;
    else break;
  }
  return n;
}

// ── Günlük oyun ("Günün 3 maçı"): İstanbul günü 00:00–24:00 ─────────────────────────────────────────────────────────
const DAY_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** O anın İstanbul günü: "2026-10-19". */
export function dayKeyOf(ms: number): string {
  return new Date(trDayNumber(ms) * DAY_MS).toISOString().slice(0, 10);
}

function dayNumberOf(dayKey: unknown): number | null {
  if (typeof dayKey !== 'string') return null;
  const m = DAY_KEY_RE.exec(dayKey);
  if (!m) return null;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const n = ms / DAY_MS;
  if (!Number.isInteger(n) || new Date(ms).toISOString().slice(0, 10) !== dayKey) return null;
  const y = Number(m[1]);
  return y >= 2026 && y <= 2099 ? n : null;
}

export function isDayKey(value: unknown): value is string {
  return dayNumberOf(value) != null;
}

/** Günün UTC sınırları: [startsAt, endsAt) — İstanbul 00:00 ve ertesi gün 00:00. */
export function dayRange(dayKey: string): { startsAt: Date; endsAt: Date } | null {
  const n = dayNumberOf(dayKey);
  if (n == null) return null;
  const start = n * DAY_MS - TR_OFFSET_MS;
  return { startsAt: new Date(start), endsAt: new Date(start + DAY_MS) };
}

export function shiftDay(dayKey: string, n: number): string | null {
  const d = dayNumberOf(dayKey);
  return d == null ? null : new Date((d + n) * DAY_MS).toISOString().slice(0, 10);
}

/** Günün kapsadığı UTC tarihleri (fikstür listeleri UTC gününe göre önbellekte): İstanbul günü iki UTC gününe yayılır. */
export function utcDatesOfDay(dayKey: string): string[] {
  const r = dayRange(dayKey);
  if (!r) return [];
  return [...new Set([r.startsAt.toISOString().slice(0, 10), new Date(r.endsAt.getTime() - 1).toISOString().slice(0, 10)])];
}
