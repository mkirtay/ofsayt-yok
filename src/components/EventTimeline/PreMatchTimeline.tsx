import { useRef } from 'react';
import { useMotionPause } from '@/hooks/useMotionPause';
import styles from './preMatchTimeline.module.scss';

function GoalIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="9" />
      <polygon points="12 8 15.5 10.5 14.2 14.5 9.8 14.5 8.5 10.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

/**
 * 10 · Maç Olayları: henüz başlamadı (docs/animasyon-referans/10-mac-olaylari-baslamadi.html). 0'–45'–90' zaman
 * çizelgesi; soluk gol, sarı kart ve değişiklik ikonları sırayla belirip söner, 0'da nabız. Kutuyu (96 px) çağıran
 * tutar; renkler kutudaki `--tl-*` değişkenlerinden (tema). Hareketi azalt'ta ikonlar sabit, soluk.
 */
export default function PreMatchTimeline() {
  const ref = useRef<HTMLDivElement>(null);
  useMotionPause(ref);
  return (
    <div ref={ref} className={styles.root} aria-hidden="true">
      <span className={styles.track} />
      <span className={styles.half} />
      <span className={`${styles.tick} ${styles.t0}`}>0&apos;</span>
      <span className={`${styles.tick} ${styles.t45}`}>45&apos;</span>
      <span className={`${styles.tick} ${styles.t90}`}>90&apos;</span>
      <span className={`${styles.event} ${styles.up} ${styles.e1}`}>
        <GoalIcon />
      </span>
      <span className={`${styles.event} ${styles.down} ${styles.e2}`}>
        <span className={styles.yellow} />
      </span>
      <span className={`${styles.event} ${styles.up} ${styles.e3}`}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="7 4 7 15" />
          <polyline points="3.5 11.5 7 15 10.5 11.5" />
          <polyline points="17 20 17 9" />
          <polyline points="13.5 12.5 17 9 20.5 12.5" />
        </svg>
      </span>
      <span className={`${styles.event} ${styles.down} ${styles.e4}`}>
        <GoalIcon />
      </span>
      <span className={styles.pulse} />
      <span className={styles.now} />
    </div>
  );
}
