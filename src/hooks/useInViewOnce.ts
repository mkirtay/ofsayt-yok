import { useEffect, useRef, useState } from 'react';

/**
 * Eleman görünür alana `rootMargin` kadar yaklaşınca bir kez `true` olur (ekranın altındaki kartların verisini
 * ilk yüke eklememek için). IntersectionObserver yoksa hemen `true`.
 */
export function useInViewOnce<T extends Element>(rootMargin = '300px') {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    if (inView) return;
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      const id = setTimeout(() => setInView(true), 0);
      return () => clearTimeout(id);
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          io.disconnect();
        }
      },
      { rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [inView, rootMargin]);
  return [ref, inView] as const;
}
