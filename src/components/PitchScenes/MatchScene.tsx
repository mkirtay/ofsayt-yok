import { useRef } from 'react';
import { useMotionPause } from '@/hooks/useMotionPause';
import turf from './turf.module.scss';
import styles from './matchScene.module.scss';

/** 01 · Maç oynanıyor (504×230). Kural Köşesi'nde 01 ve 06 kayıtları bu sahneyi kullanır. */
export default function MatchScene() {
  const ref = useRef<HTMLDivElement>(null);
  useMotionPause(ref);
  return (
    <div ref={ref} className={`${turf.turf} ${styles.root}`} aria-hidden="true">
      <span className={turf.stripes} />
      <div className={`${styles.goal} ${styles.goalL}`}>
        <span className={styles.net} />
        <span className={`${styles.flash} ${styles.flashL}`} />
      </div>
      <div className={`${styles.team} ${styles.teamL}`}>
        <span className={`${styles.player} ${turf.home}`} style={{ animationDelay: '0s' }} />
        <span className={`${styles.player} ${turf.home}`} style={{ animationDelay: '0.35s' }} />
      </div>
      <span className={styles.glow} />
      <span className={`${turf.ball} ${styles.mover}`} />
      <div className={`${styles.team} ${styles.teamR}`}>
        <span className={`${styles.player} ${turf.away}`} style={{ animationDelay: '0.15s' }} />
        <span className={`${styles.player} ${turf.away}`} style={{ animationDelay: '0.5s' }} />
      </div>
      <div className={`${styles.goal} ${styles.goalR}`}>
        <span className={styles.net} />
        <span className={`${styles.flash} ${styles.flashR}`} />
      </div>
    </div>
  );
}
