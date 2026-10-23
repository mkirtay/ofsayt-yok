/** Misafire "üye ol, 2 kredi hediye" kartının ne zaman/nerede çıkacağı. Saf mantık: bileşen yalnızca zamanlayıcıyı kurar. */
export const NUDGE_DELAY_MS = 25_000;
export const NUDGE_STORAGE_KEY = 'signupNudgeDismissedAt';
export const NUDGE_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

/** Giriş/kayıt, admin, yasal ve hesap silme sayfalarında davet gösterilmez. */
export function isNudgeHiddenPath(pathname: string): boolean {
  return /^\/(auth|admin|yasal|hesap-silme|pricing|iletisim)(\/|$)/.test(pathname);
}

export function isNudgeCoolingDown(dismissedAt: string | null, now: number): boolean {
  const at = Number(dismissedAt);
  return Number.isFinite(at) && at > 0 && now - at < NUDGE_COOLDOWN_MS;
}
