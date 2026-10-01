import { useRef, type CSSProperties } from 'react';
import { useMotionPause } from '@/hooks/useMotionPause';
import turf from './turf.module.scss';
import styles from './formationScene.module.scss';

// [x, y, gecikme sn] — 09-kural-kosesi.html .d0–.d21 (ev 4-3-3, deplasman 4-2-3-1).
const HOME: ReadonlyArray<readonly [number, number, number]> = [
  [-222, 0, 0], [-170, -78, 0.04], [-170, -28, 0.06], [-170, 28, 0.08], [-170, 78, 0.1],
  [-112, -55, 0.14], [-112, 0, 0.16], [-112, 55, 0.18], [-52, -72, 0.22], [-52, 0, 0.24], [-52, 72, 0.26],
];
const AWAY: ReadonlyArray<readonly [number, number, number]> = [
  [222, 0, 0.3], [170, -78, 0.34], [170, -28, 0.36], [170, 28, 0.38], [170, 78, 0.4],
  [124, -32, 0.44], [124, 32, 0.46], [80, -62, 0.48], [80, 0, 0.52], [80, 62, 0.54], [36, 0, 0.56],
];

function dotStyle([x, y, delay]: readonly [number, number, number]): CSSProperties {
  return { '--x': `${x}px`, '--y': `${y}px`, animationDelay: `${delay}s` } as CSSProperties;
}

/** 02 · Diziliş kuruluyor (504×230). */
export default function FormationScene() {
  const ref = useRef<HTMLDivElement>(null);
  useMotionPause(ref);
  return (
    <div ref={ref} className={`${turf.turf} ${styles.root}`} aria-hidden="true">
      <span className={turf.stripes} />
      <span className={turf.centerLine} />
      <span className={turf.centerCircle} />
      <span className={`${turf.box} ${turf.boxL}`} />
      <span className={`${turf.box} ${turf.boxR}`} />
      <span className={`${turf.post} ${turf.postL}`} />
      <span className={`${turf.post} ${turf.postR}`} />
      <span className={`${turf.ball} ${styles.ball}`} />
      {HOME.map((p, i) => (
        <span key={`h${i}`} className={`${styles.dot} ${turf.home}`} style={dotStyle(p)} />
      ))}
      {AWAY.map((p, i) => (
        <span key={`a${i}`} className={`${styles.dot} ${turf.away}`} style={dotStyle(p)} />
      ))}
      <span className={`${styles.chip} ${styles.chipL}`}>4-3-3</span>
      <span className={`${styles.chip} ${styles.chipR}`}>4-2-3-1</span>
    </div>
  );
}
