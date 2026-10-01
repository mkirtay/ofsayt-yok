import { useRef } from 'react';
import { useMotionPause } from '@/hooks/useMotionPause';
import turf from './turf.module.scss';
import styles from './ringScene.module.scss';

/** 08 · Halka sahnesi (504×230). `label` varsa sol üstte etiket (ör. "8 SANİYE"). */
export default function RingScene({ label }: { label?: string | null }) {
  const ref = useRef<HTMLDivElement>(null);
  useMotionPause(ref);
  return (
    <div ref={ref} className={`${turf.turf} ${styles.root}`} aria-hidden="true">
      <span className={turf.stripes} />
      <span className={`${turf.box} ${turf.boxL}`} />
      <span className={`${turf.post} ${turf.postL}`} />
      <svg className={styles.ring} viewBox="0 0 156 156">
        <circle cx="78" cy="78" r="66" fill="none" stroke="rgba(255,255,255,.22)" strokeWidth="4" />
        <circle
          className={styles.ringFill}
          cx="78"
          cy="78"
          r="66"
          fill="none"
          stroke="#ffffff"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray="415"
          strokeDashoffset="0"
          transform="rotate(-90 78 78)"
        />
      </svg>
      <span className={`${styles.keeper} ${turf.home}`} />
      <span className={`${turf.ball} ${styles.ball}`} />
      {label ? <span className={styles.chip}>{label}</span> : null}
    </div>
  );
}
