import { useEffect, type RefObject } from 'react';
import { BOTTOM_STACK_OFFSET_VAR, NUDGE_OPEN_ATTR, NUDGE_TOGGLE_EVENT } from './nudge';

/**
 * Alt köşe kartı açıkken alt yığına bildirir: `<html data-signup-nudge>` + mobilde `--nudge-top-offset` (kartın tepesi + boşluk).
 * Misafir kartı (SignupNudge) ve girişli kullanıcının ödül kartı (RewardNudge) ortak kullanır; ikisi aynı anda açık olmaz.
 */
export function useNudgeStack(ref: RefObject<HTMLElement | null>, visible: boolean): void {
  useEffect(() => {
    const el = ref.current;
    if (!visible || !el) return;
    const root = document.documentElement;
    const mobile = window.matchMedia('(max-width: 1023.98px)');
    const sync = () => {
      const offset = mobile.matches ? Math.ceil(window.innerHeight - el.getBoundingClientRect().top + 8) : 0;
      root.style.setProperty(BOTTOM_STACK_OFFSET_VAR, `${Math.max(0, offset)}px`);
    };
    root.setAttribute(NUDGE_OPEN_ATTR, '');
    sync();
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(sync);
    ro?.observe(el);
    window.addEventListener('resize', sync);
    window.dispatchEvent(new Event(NUDGE_TOGGLE_EVENT));
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', sync);
      root.removeAttribute(NUDGE_OPEN_ATTR);
      root.style.removeProperty(BOTTOM_STACK_OFFSET_VAR);
      window.dispatchEvent(new Event(NUDGE_TOGGLE_EVENT));
    };
  }, [ref, visible]);
}
