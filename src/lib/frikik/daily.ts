/**
 * "Günün frikiği": herkes aynı seviye dizisini oynar. Gün Türkiye saatine göre (UTC+3, yaz saati yok); tohum gün
 * numarasından türetilir (Math.random yok). Tarih/saat yalnız burada ve bileşende; simülasyon (sim.ts) saat bilmez.
 */
const TR_OFFSET_MS = 3 * 3_600_000;
const DAY_MS = 86_400_000;

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
