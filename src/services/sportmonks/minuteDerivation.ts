/**
 * Sportmonks `periods[]` dizisinden canlı dakika göstergesini türetir.
 *
 * Kaynak: docs/SPORTMONKS_MIGRATION.md Pass 3 "Soru 1" + Pass 5.
 * Pass 3'te üç ayrı zaman noktasında ölçüldü: `periods[0].minutes/seconds`
 * her istekte `started` epoch'una göre sunucu tarafında gerçek-zamanlı
 * hesaplanıyor (700 saniyelik fark → "11:41" ile matematiksel olarak
 * örtüştü). AYNI zamanda `include=currentPeriod` `periods[0].ticking:true`
 * olmasına RAĞMEN hep `null` döndü (dokümanla çelişen bir davranış) —
 * bu yüzden `currentPeriod` alanına BURADA KASITLI OLARAK hiç bakılmıyor,
 * sadece `periods[].ticking===true` kullanılıyor.
 */
import type { SportmonksPeriod } from './types';

/** `ticking===true` olan period'u bulur — yoksa maç şu an canlı değil demektir. */
export function findActivePeriod(periods: SportmonksPeriod[] | undefined | null): SportmonksPeriod | null {
  if (!periods || periods.length === 0) return null;
  return periods.find((p) => p.ticking === true) ?? null;
}

export type LiveMinute = { minutes: number; seconds: number; hasTimer: boolean };

/** Aktif period'un ham dakika/saniye değerini döner, canlı değilse `null`. */
export function deriveLiveMinute(periods: SportmonksPeriod[] | undefined | null): LiveMinute | null {
  const active = findActivePeriod(periods);
  if (!active) return null;
  return { minutes: active.minutes, seconds: active.seconds, hasTimer: active.has_timer };
}

/**
 * Mevcut `Match.time` alanının beklediği kısa gösterim string'ini üretir
 * (ör. `"11'"`). Maç canlı değilse `null` döner. `has_timer:false` olan
 * ligler için saniye bilgisi zaten `LiveMinute`'ta yok, format hep dakika
 * bazlı (Pass 2: "Bazı liglerde saniye verisi olmayabiliyor").
 */
export function formatLiveMinuteLabel(periods: SportmonksPeriod[] | undefined | null): string | null {
  const live = deriveLiveMinute(periods);
  if (!live) return null;
  return `${live.minutes}'`;
}
