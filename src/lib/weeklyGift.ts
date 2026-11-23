/**
 * Haftalık kredi hediyesi (2026-11-23 kullanıcı kararı): kayıtlı her kullanıcıya TR haftası (Pazartesi 00:00 TSİ)
 * başına 2 kredi. Kullanıcı pop-up'tan "Al" der; sunucu `(userId, weekly-gift:{hafta})` tekil anahtarıyla bir kez verir.
 * Kötüye kullanım koruması diğer ödüllerle aynı: yalnız e-postası doğrulanmış hesap (server/rewards.ts `grantReward`).
 * Saf modül (prisma yok) — istemci de hafta anahtarını buradan alır.
 */
import { weekKeyOf } from '@/lib/game/week';

export const WEEKLY_GIFT_AMOUNT = 2;
export const WEEKLY_GIFT_TYPE = 'WEEKLY_GIFT' as const;

export function weeklyGiftKey(now: number = Date.now()): string {
  return `weekly-gift:${weekKeyOf(now)}`;
}

/** İstemci: bu hafta pop-up gösterildi / kapatıldı mı (localStorage değeri = hafta anahtarı). */
export const WEEKLY_GIFT_STORAGE_KEY = 'scor3_weekly_gift_seen';

export function seenThisWeek(stored: string | null, now: number = Date.now()): boolean {
  return stored === weekKeyOf(now);
}

/** Pop-up'ın çıkmayacağı sayfalar (giriş/kayıt, admin, yasal, ödeme, oyun alanları). */
export function isWeeklyGiftHiddenPath(pathname: string): boolean {
  return /^\/(auth|admin|yasal|hesap-silme|iletisim|odeme|frikik|mini-saha|onizleme)(\/|$)/.test(pathname);
}
