import { useRef } from 'react';
import { useMotionPause } from '@/hooks/useMotionPause';
import turf from './turf.module.scss';
import styles from './varScene.module.scss';

/** 03 · VAR: Ofsayt yok (504×230). `stampLabel`: mühür metni (TR "OFSAYT YOK", EN "NO OFFSIDE"). */
export default function VarScene({ stampLabel }: { stampLabel: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useMotionPause(ref);
  return (
    <div ref={ref} className={`${turf.turf} ${styles.root}`} aria-hidden="true">
      <span className={turf.stripes} />
      <span className={`${turf.box} ${turf.boxR}`} />
      <span className={`${turf.post} ${turf.postR}`} />
      <span className={`${styles.player} ${turf.home} ${styles.runA}`} style={{ left: 228, top: 70 }} />
      <span className={`${turf.ball} ${styles.ball} ${styles.runA}`} style={{ left: 246, top: 80 }} />
      <span className={`${styles.player} ${turf.home} ${styles.runA}`} style={{ left: 292, top: 140 }} />
      <span className={`${styles.player} ${turf.away} ${styles.runD}`} style={{ left: 312, top: 84 }} />
      <span className={`${styles.player} ${turf.away} ${styles.runD}`} style={{ left: 372, top: 152 }} />
      <span className={styles.freeze} />
      <span className={styles.band} />
      <span className={`${styles.line} ${styles.lineA}`} />
      <span className={`${styles.line} ${styles.lineD}`} />
      <span className={styles.var}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="5" width="18" height="12" rx="2" />
          <line x1="8" y1="21" x2="16" y2="21" />
        </svg>
        VAR
      </span>
      <span className={styles.stamp}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
        {stampLabel}
      </span>
    </div>
  );
}
