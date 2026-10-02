import { useEffect, useState } from 'react';

type IdleWindow = Window & {
  requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  cancelIdleCallback?: (id: number) => void;
};

/**
 * Eleman görünür alana `rootMargin` kadar yaklaşınca bir kez `true` olur (ekranın altındaki kartların verisini
 * ilk yüke eklememek için). Görünür olduktan sonra tarayıcı boşa çıkınca (en geç `idleTimeout` ms) açılır: kart
 * ilk ekranın kenarındaysa bile isteği sayfanın kritik yolundan (LCP) sonraya bırakır. IntersectionObserver
 * yoksa doğrudan boşta açılır.
 *
 * Dönen `ref` bir callback ref: eleman sonradan çizilse (ör. koşullu kart) de gözlem o an başlar.
 */
export function useInViewOnce<T extends Element>(rootMargin = '200px', idleTimeout = 1500) {
  const [el, setEl] = useState<T | null>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    if (inView || !el) return;
    const w = window as IdleWindow;
    let idleId: number | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const open = () => {
      if (w.requestIdleCallback) idleId = w.requestIdleCallback(() => setInView(true), { timeout: idleTimeout });
      else timer = setTimeout(() => setInView(true), 200);
    };
    let io: IntersectionObserver | undefined;
    if (typeof IntersectionObserver === 'undefined') {
      open();
    } else {
      io = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            io?.disconnect();
            open();
          }
        },
        { rootMargin },
      );
      io.observe(el);
    }
    return () => {
      io?.disconnect();
      if (idleId !== undefined) w.cancelIdleCallback?.(idleId);
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [el, inView, rootMargin, idleTimeout]);
  return [setEl, inView] as const;
}
