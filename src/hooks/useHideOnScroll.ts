import { useEffect } from 'react';
import { MOBILE_LAYOUT_QUERY } from '@/config/breakpoints';

/** Kök elemandaki işaret: header ve yapışık gün şeridi CSS'te buna göre yalnız `transform` ile kayar. */
export const CHROME_HIDDEN_ATTR = 'data-chrome-hidden';
/** Bu kadar px'ten küçük yön değişimleri (parmak titremesi, momentum sonu) yok sayılır. */
const DIRECTION_THRESHOLD_PX = 6;

/**
 * Aşağı kaydırma → `CHROME_HIDDEN_ATTR` koyulur; yukarı kaydırma ya da sayfanın en üstü (header yüksekliği kadar)
 * → kaldırılır. Yalnız mobil düzende (< 1024 px). rAF ile kısıtlı, pasif dinleyici; layout okuması yok (scrollY).
 */
export function decideChromeHidden(
  prevHidden: boolean,
  lastY: number,
  y: number,
  headerHeight: number,
): { hidden: boolean; anchorY: number } {
  if (y <= headerHeight) return { hidden: false, anchorY: y };
  const delta = y - lastY;
  if (delta > DIRECTION_THRESHOLD_PX) return { hidden: true, anchorY: y };
  if (delta < -DIRECTION_THRESHOLD_PX) return { hidden: false, anchorY: y };
  return { hidden: prevHidden, anchorY: lastY };
}

export function useHideOnScroll(enabled = true): void {
  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;
    const root = document.documentElement;
    const media = window.matchMedia(MOBILE_LAYOUT_QUERY);
    let hidden = false;
    let anchorY = window.scrollY;
    let frame = 0;

    const apply = (next: boolean) => {
      if (next === hidden) return;
      hidden = next;
      if (next) root.setAttribute(CHROME_HIDDEN_ATTR, '');
      else root.removeAttribute(CHROME_HIDDEN_ATTR);
    };

    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (!media.matches) return apply(false);
        const headerHeight = parseFloat(getComputedStyle(root).getPropertyValue('--header-height')) || 60;
        const result = decideChromeHidden(hidden, anchorY, window.scrollY, headerHeight);
        anchorY = result.anchorY;
        apply(result.hidden);
      });
    };
    const onMediaChange = () => {
      if (!media.matches) apply(false);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    media.addEventListener('change', onMediaChange);
    return () => {
      window.removeEventListener('scroll', onScroll);
      media.removeEventListener('change', onMediaChange);
      if (frame) cancelAnimationFrame(frame);
      root.removeAttribute(CHROME_HIDDEN_ATTR);
    };
  }, [enabled]);
}
