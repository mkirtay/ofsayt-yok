import { useRef } from 'react';
import { useMotionPause } from '@/hooks/useMotionPause';
import turf from './turf.module.scss';
import styles from './kickoffRing.module.scss';

/**
 * 08 · Maç henüz başlamadı (docs/animasyon-referans/08-mac-baslamadi.html): kutu genişliğinde 96 px saha, ortada
 * dolan halka ve nefes alan top. Kutuyu çağıran tutar; ekran dışı/arka planda durur, Hareketi azalt'ta tek kare.
 */
export default function KickoffRing() {
  const ref = useRef<HTMLDivElement>(null);
  useMotionPause(ref);
  return (
    <div ref={ref} className={`${turf.turf} ${styles.root}`} aria-hidden="true">
      <span className={turf.stripes} />
      <span className={turf.centerLine} />
      <svg className={styles.ring} viewBox="0 0 80 80">
        <circle cx="40" cy="40" r="34" fill="none" stroke="rgba(255,255,255,.25)" strokeWidth="3" />
        <circle
          className={styles.ringFill}
          cx="40"
          cy="40"
          r="34"
          fill="none"
          stroke="#ffffff"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray="214"
          strokeDashoffset="0"
          transform="rotate(-90 40 40)"
        />
      </svg>
      <span className={`${turf.ball} ${styles.ball}`} />
    </div>
  );
}
