import { useEffect, type RefObject } from 'react';

/**
 * Animasyon kökünü görünmezken durdurur: sekme arka plandayken ve (`offscreen` açıksa) ekran dışındayken köke
 * `data-motion-paused` koyar; CSS tarafı `styles/_motion.scss` → `motion-root`. Yeniden render yok, yalnız öznitelik.
 */
export function useMotionPause(ref: RefObject<HTMLElement | null>, { offscreen = true }: { offscreen?: boolean } = {}) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let inView = true;
    const apply = () => {
      const paused = document.visibilityState === 'hidden' || !inView;
      if (paused) el.setAttribute('data-motion-paused', '');
      else el.removeAttribute('data-motion-paused');
    };
    let observer: IntersectionObserver | null = null;
    if (offscreen && typeof IntersectionObserver === 'function') {
      observer = new IntersectionObserver((entries) => {
        inView = entries.some((entry) => entry.isIntersecting);
        apply();
      });
      observer.observe(el);
    }
    document.addEventListener('visibilitychange', apply);
    apply();
    return () => {
      observer?.disconnect();
      document.removeEventListener('visibilitychange', apply);
    };
  }, [ref, offscreen]);
}
