/**
 * Girişli kullanıcıya günde bir kez çıkan "ücretsiz kredi kazan" kartı — saf mantık (gün anahtarı, gizli sayfalar, mesaj seçimi).
 * Öncelik: e-posta doğrulanmamış → bulunulan oyunun ilerlemesi (Frikik / tahmin oyunu) → alınmayı bekleyen görev ödülü →
 * yapılmamış görev → genel oyun ödülleri.
 */
import { GAME_BRAND } from '@/config/brand';
import type { OnboardingStatus } from '@/server/rewards';

export const REWARD_NUDGE_STORAGE_KEY = 'rewardNudgeDay';
export const REWARD_NUDGE_DELAY_MS = 8_000;

/** İstanbul günü ("2026-11-13"): kart bu gün kapatıldıysa / gösterildiyse bir daha çıkmaz. */
export function istanbulDay(now: number): string {
  return new Date(now + 3 * 3_600_000).toISOString().slice(0, 10);
}

export function shownToday(stored: string | null, now: number): boolean {
  return stored === istanbulDay(now);
}

/** Profil (kart zaten orada), giriş, yönetici, yasal ve ödeme sayfalarında çıkmaz. */
export function isRewardNudgeHiddenPath(pathname: string): boolean {
  return /^\/(auth|admin|yasal|hesap-silme|pricing|iletisim|profile|odeme)(\/|$)/.test(pathname);
}

export type NudgeMessage =
  | { kind: 'verify' }
  | { kind: 'frikik'; days: number; target: number }
  | { kind: 'frikikDone'; target: number }
  | { kind: 'game'; picks: number; matches: number }
  | { kind: 'gameDone' }
  | { kind: 'tasksReady'; count: number }
  | { kind: 'tasksOpen'; count: number }
  | { kind: 'games'; days: number; target: number };

export function pickNudgeMessage(pathname: string, s: OnboardingStatus): NudgeMessage {
  if (!s.verified) return { kind: 'verify' };
  const p = s.progress;
  if (/^\/frikik(\/|$)/.test(pathname)) {
    return p.frikikDays >= p.frikikTarget ? { kind: 'frikikDone', target: p.frikikTarget } : { kind: 'frikik', days: p.frikikDays, target: p.frikikTarget };
  }
  if ((pathname === GAME_BRAND.basePath || pathname.startsWith(`${GAME_BRAND.basePath}/`)) && p.week) {
    return p.week.picks >= p.week.matches ? { kind: 'gameDone' } : { kind: 'game', picks: p.week.picks, matches: p.week.matches };
  }
  const ready = s.tasks.filter((t) => t.done && !t.claimed).length;
  if (ready > 0) return { kind: 'tasksReady', count: ready };
  const open = s.tasks.filter((t) => !t.done).length;
  if (open > 0) return { kind: 'tasksOpen', count: open };
  return { kind: 'games', days: p.frikikDays, target: p.frikikTarget };
}
