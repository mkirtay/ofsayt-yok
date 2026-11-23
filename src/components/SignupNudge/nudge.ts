/** Misafire "üye ol, 2 kredi hediye" kartının ne zaman/nerede çıkacağı. Saf mantık: bileşen yalnızca zamanlayıcıyı kurar. */
export const NUDGE_DELAY_MS = 7_000;

/**
 * Davet yalnız anlamlı bir etkileşimden sonra (2026-11-23): sayfada en az ~1 ekran aşağı inmek ya da oturumda ikinci
 * sayfayı açmak. Skor / maç için gelen kişi ilk ekranda içeriğin üstünde kart görmez.
 */
export const NUDGE_SCROLL_SCREENS = 0.8;

export function isNudgeEngaged(e: { scrollY: number; viewportHeight: number; pageViews: number }): boolean {
  return e.pageViews >= 2 || (e.viewportHeight > 0 && e.scrollY >= e.viewportHeight * NUDGE_SCROLL_SCREENS);
}
export const NUDGE_STORAGE_KEY = 'signupNudgeDismissedAt';
export const NUDGE_COOLDOWN_MS = 24 * 60 * 60 * 1000;

/** Giriş/kayıt, admin, yasal ve hesap silme sayfalarında davet gösterilmez. */
export function isNudgeHiddenPath(pathname: string): boolean {
  return /^\/(auth|admin|yasal|hesap-silme|pricing|iletisim)(\/|$)/.test(pathname);
}

export function isNudgeCoolingDown(dismissedAt: string | null, now: number): boolean {
  const at = Number(dismissedAt);
  return Number.isFinite(at) && at > 0 && now - at < NUDGE_COOLDOWN_MS;
}

/**
 * Kart açıkken `<html data-signup-nudge>` + `--nudge-top-offset` (mobilde ekranın altından kartın tepesine +
 * boşluk, px; masaüstünde 0). Alt bölgedeki geçici öğeler (yüzen düğme etiketleri, ipucu baloncukları, bildirimler)
 * kartla üst üste binmemek için buna bakar. Açılış/kapanışta `NUDGE_TOGGLE_EVENT` yayınlanır.
 */
export const NUDGE_OPEN_ATTR = 'data-signup-nudge';
export const NUDGE_TOGGLE_EVENT = 'scor3:signup-nudge';
export const BOTTOM_STACK_OFFSET_VAR = '--nudge-top-offset';

export function isNudgeOpen(): boolean {
  return typeof document !== 'undefined' && document.documentElement.hasAttribute(NUDGE_OPEN_ATTR);
}

/** Alt yığın ofseti (px) — kart yoksa / masaüstünde 0. */
export function bottomStackOffset(): number {
  if (typeof document === 'undefined') return 0;
  const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(BOTTOM_STACK_OFFSET_VAR));
  return Number.isFinite(v) && v > 0 ? v : 0;
}
