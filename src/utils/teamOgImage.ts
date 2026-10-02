/**
 * Takım paylaşım görselinin adresi: `/api/og/team/{id}?v={gün}`. İçerik (logo, lig sırası, form) her zaman sunucudaki
 * takım verisinden gelir; `v` yalnızca önbellek anahtarı — TSİ günü (YYYYMMDD), görsel günde bir tazelenir.
 */
import { todayIsoIstanbul } from '@/utils/dateStrip';

const DAY_MS = 86_400_000;

export function teamOgVersion(now: number = Date.now()): string {
  return todayIsoIstanbul(new Date(now)).replace(/-/g, '');
}

export function teamOgImagePath(teamId: string | number, now: number = Date.now()): string {
  return `/api/og/team/${teamId}?v=${teamOgVersion(now)}`;
}

/**
 * Kabul edilen sürümler: bugün ve dün. Takım sayfası HTML'i günde bir yenilenir (ISR); gece yarısından önce üretilmiş
 * sayfanın adresi ertesi gün de yönlendirmesiz çalışsın.
 */
export function isAcceptedTeamOgVersion(v: unknown, now: number = Date.now()): boolean {
  return v === teamOgVersion(now) || v === teamOgVersion(now - DAY_MS);
}
