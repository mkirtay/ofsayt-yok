import { useEffect, useState } from 'react';
import LazyLoad from '@/components/LazyLoad';
import styles from './authBackdrop.module.scss';

/** Oyun alanı (saha + fırlatılabilir top) ayrı parça: sayfa yüklendikten ve tarayıcı boşa düştükten sonra gelir. */
const loadPlayground = () => import('./PitchPlayground');

/**
 * Giriş / kayıt sayfalarının dekoratif arka planı. Sunucu HTML'inde yalnız boş, mutlak konumlu kap (kayma yok); saha
 * ve top boşta yüklenir. aria-hidden; tıklamalar arka plandan geçer (yalnız top tutulabilir), form kartı üstte.
 * Kartın bulunduğu kapsayıcı `position: relative` olmalı.
 */
export default function AuthBackdrop() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const go = () => setReady(true);
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(go, { timeout: 2500 });
      return () => window.cancelIdleCallback(id);
    }
    const t = window.setTimeout(go, 1200);
    return () => window.clearTimeout(t);
  }, []);
  return (
    <div className={styles.backdrop} aria-hidden="true">
      {ready ? <LazyLoad load={loadPlayground} props={{}} /> : null}
    </div>
  );
}
