import { useRef } from 'react';
import { useMotionPause } from '@/hooks/useMotionPause';
import turf from '@/components/PitchScenes/turf.module.scss';
import styles from './contactBandScene.module.scss';

/**
 * 16 · İletişim bandı sahnesi (360×120, bant ortasında; masaüstünde sabit ölçek). İki oyuncu paslaşır, son pas
 * zarf şeklindeki kaleye girer, kapak kapanır. Hareketi azalt'ta top zarfa giderken tek kare.
 */
export default function ContactBandScene() {
  const ref = useRef<HTMLDivElement>(null);
  useMotionPause(ref);
  return (
    <div ref={ref} className={styles.root}>
      <span className={styles.envelope}>
        <svg className={styles.body} width="64" height="44" viewBox="0 0 64 44" fill="none" strokeLinejoin="round">
          <rect x="1.5" y="1.5" width="61" height="41" rx="4" fill="#ffffff" stroke="#ffffff" strokeWidth="3" />
          <path d="M4 40 L26 22 M60 40 L38 22" stroke="#cfe3d9" strokeWidth="2" />
          <path d="M3 4 L32 26 L61 4" stroke="#007b55" strokeWidth="2.5" />
        </svg>
        <svg className={styles.flap} width="64" height="26" viewBox="0 0 64 26">
          <path d="M2 1 L32 24 L62 1 Z" fill="#eef7f2" stroke="#007b55" strokeWidth="2.5" strokeLinejoin="round" />
        </svg>
      </span>
      <span className={`${styles.player} ${styles.a}`} />
      <span className={`${styles.player} ${styles.b}`} />
      <span className={`${turf.ball} ${styles.ball}`} />
    </div>
  );
}
