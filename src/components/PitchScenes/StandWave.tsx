import { useRef, type CSSProperties } from 'react';
import { useDelayedShow } from '@/hooks/useDelayedShow';
import { useMotionPause } from '@/hooks/useMotionPause';
import ScaledScene from './ScaledScene';
import turf from './turf.module.scss';
import styles from './standWave.module.scss';

// Koltuk gecikmeleri (sn) — docs/animasyon-referans/05-tribun-dalgasi.html ile birebir (4 sıra × 21).
const DELAYS: ReadonlyArray<ReadonlyArray<number>> = [
  [0, 0.06, 0.12, 0.18, 0.24, 0.3, 0.36, 0.42, 0.48, 0.54, 0.6, 0.66, 0.72, 0.78, 0.84, 0.9, 0.96, 1.02, 1.08, 1.14, 1.2],
  [0.04, 0.1, 0.15, 0.21, 0.28, 0.33, 0.4, 0.45, 0.52, 0.58, 0.64, 0.69, 0.76, 0.82, 0.88, 0.93, 0.99, 1.05, 1.11, 1.17, 1.23],
  [0.07, 0.13, 0.19, 0.25, 0.31, 0.37, 0.43, 0.49, 0.55, 0.61, 0.67, 0.73, 0.79, 0.85, 0.91, 0.97, 1.03, 1.09, 1.15, 1.21, 1.27],
  [0.11, 0.17, 0.23, 0.29, 0.34, 0.41, 0.46, 0.53, 0.58, 0.65, 0.7, 0.76, 0.82, 0.89, 0.94, 1, 1.06, 1.12, 1.19, 1.24, 1.3],
];

/**
 * 05 · Tribün dalgası (504×226), kutu genişliğine ölçekli. Gündem akışı ve maç forumu ilk yüklenirken; kutuyu
 * çağıran tutar (en-boy oranı), bu bileşen 300 ms sonra görünür.
 */
export default function StandWave() {
  const ref = useRef<HTMLDivElement>(null);
  useMotionPause(ref);
  const shown = useDelayedShow(300);
  return (
    <div ref={ref} className={`${styles.root} ${shown ? '' : styles.waiting}`}>
      <ScaledScene height={226}>
        <div className={styles.stand}>
          <div className={styles.seats}>
            {DELAYS.map((row, r) => (
              <div key={r} className={styles.row}>
                {row.map((delay, i) => (
                  <span key={i} className={styles.seat} style={{ '--d': `${delay}s` } as CSSProperties} />
                ))}
              </div>
            ))}
          </div>
          <div className={`${turf.turf} ${styles.pitch}`}>
            <span className={turf.stripes} />
          </div>
        </div>
      </ScaledScene>
    </div>
  );
}
