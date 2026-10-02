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
 * Kabul edilen sürümler: bugün ve dün (gece yarısından hemen önce üretilmiş adres ertesi gün de doğrudan çalışsın).
 * Takım sayfası kabuğu 7 günde bir yenilendiği için HTML'deki `v` daha eski olabilir → route çizmeden güncel adrese
 * 307 ile yönlendirir.
 */
export function isAcceptedTeamOgVersion(v: unknown, now: number = Date.now()): boolean {
  return v === teamOgVersion(now) || v === teamOgVersion(now - DAY_MS);
}
