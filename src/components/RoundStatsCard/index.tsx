import { useEffect, useRef, useState } from 'react';
import LazyLoad from '@/components/LazyLoad';
import type { RoundStatsCardProps } from './Card';
import styles from './roundStatsCard.module.scss';

const loadCard = () => import('./Card');

/**
 * Lig sayfasındaki "Haftanın Özeti" yuvası: yer baştan ayrılır (CLS yok), kart kodu ve verisi yalnız yuva görünüme
 * yaklaşınca yüklenir (ilk yük paketine girmez). Veri yoksa kart `null` döner ve yuva çöker. Masaüstünde yuva yan
 * sütunda, ilk görünümde olabilir: yükseklik baştan ayrıldığı için kart gelince yan sütun / tablo kaymaz.
 */
export default function RoundStatsSlot(props: RoundStatsCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  // Yükseklik iç kutuda ayrılır (dış kutu genişliği ölçülen kap; bkz. roundStatsCard.module.scss).
  const reserveRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [empty, setEmpty] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || visible) return;
    if (typeof IntersectionObserver === 'undefined') {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- eski tarayıcı: gözlemci yok → hemen yükle
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: '300px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);

  // Kart boş (null) çizdiyse yuva yüksekliği bırakılır: kartın kendi kutusu yoksa yuva çöker.
  useEffect(() => {
    if (!visible) return;
    const el = reserveRef.current;
    if (!el || typeof MutationObserver === 'undefined') return;
    const check = () => setEmpty(el.childElementCount === 0);
    const mo = new MutationObserver(check);
    mo.observe(el, { childList: true });
    return () => mo.disconnect();
  }, [visible]);

  return (
    <div ref={ref} className={`${styles.slot} ${empty ? styles.slotEmpty : ''}`.trim()} data-testid="round-stats-slot">
      <div ref={reserveRef} className={styles.reserve}>
        {visible ? <LazyLoad load={loadCard} props={props} /> : null}
      </div>
    </div>
  );
}
