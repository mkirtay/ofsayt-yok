import { useEffect, type RefObject } from 'react';

/**
 * Mobil alt bölge tek "yığın": aşağıdan yukarı alt menü → üye ol kartı (varsa) → gol bildirimleri / tanıtım balonları.
 * Yığının tabanındaki sabit kart (SignupNudge) açıkken kendi yüksekliğini `<html>` üzerinde paylaşır; üstüne dizilenler
 * sabit sayı varsaymadan bu değişkenle konumlanır:
 *
 *   html[data-bottom-stack] .x { bottom: calc(var(--bottom-nav-height) + var(--safe-bottom) + 12px
 *                                             + var(--bottom-stack-offset) + 8px) }
 *
 * (12 px kartın alt menüden boşluğu = `$spacing-3`, 8 px kartla üstündeki arasındaki boşluk.)
 */
export const BOTTOM_STACK_VAR = '--bottom-stack-offset';
export const BOTTOM_STACK_ATTR = 'data-bottom-stack';

/** Ölçülen yüksekliği yazar (değişmediyse dokunmaz); kart kapanınca / söküldüğünde değişken ve öznitelik kalkar. */
export function writeBottomStack(root: HTMLElement, height: number | null): void {
  if (height == null) {
    root.removeAttribute(BOTTOM_STACK_ATTR);
    root.style.removeProperty(BOTTOM_STACK_VAR);
    return;
  }
  const value = `${Math.ceil(height)}px`;
  if (root.style.getPropertyValue(BOTTOM_STACK_VAR) !== value) root.style.setProperty(BOTTOM_STACK_VAR, value);
  if (!root.hasAttribute(BOTTOM_STACK_ATTR)) root.setAttribute(BOTTOM_STACK_ATTR, '');
}

/** `ref`teki eleman çizildiği sürece yüksekliğini (ResizeObserver) yığın değişkenine yazar. */
export function useBottomStackSlot(ref: RefObject<HTMLElement | null>, active: boolean): void {
  useEffect(() => {
    const el = ref.current;
    if (!active || !el) return;
    const root = document.documentElement;
    const measure = () => writeBottomStack(root, el.getBoundingClientRect().height);
    measure();
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    ro?.observe(el);
    return () => {
      ro?.disconnect();
      writeBottomStack(root, null);
    };
  }, [ref, active]);
}
