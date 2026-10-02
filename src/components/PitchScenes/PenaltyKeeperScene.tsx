import { useRef } from 'react';
import { useI18n } from '@/lib/i18n';
import { useMotionPause } from '@/hooks/useMotionPause';
import turf from './turf.module.scss';
import styles from './penaltyKeeperScene.module.scss';

const ON_LINE: Record<string, string> = { tr: 'Çizgide', en: 'On the line' };

/** 14 · Penaltıda kaleci (504×230): vuruş anında sahne donar, kale çizgisi ve kaleci vurgulanır → "✓ Çizgide". */
export default function PenaltyKeeperScene() {
  const { locale } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  useMotionPause(ref);
  return (
    <div ref={ref} className={`${turf.turf} ${styles.root}`} aria-hidden="true">
      <span className={turf.stripes} />
      <svg className={styles.marks} width="504" height="230" viewBox="0 0 504 230" fill="none" stroke="rgba(255,255,255,.4)" strokeWidth="2">
        <line x1="480" y1="0" x2="480" y2="230" stroke="rgba(255,255,255,.6)" />
        <rect x="348" y="25" width="132" height="180" />
        <rect x="432" y="73" width="48" height="84" />
        <path d="M348 85 A 56 56 0 0 0 348 145" />
        <rect x="480" y="90" width="14" height="50" stroke="rgba(255,255,255,.9)" strokeWidth="3" />
      </svg>
      <span className={`${turf.ball} ${styles.ball}`} />
      <span className={styles.kicker} />
      <span className={styles.flash} />
      <span className={styles.freeze} />
      <span className={styles.goalLine} />
      <span className={styles.keeper} />
      <span className={styles.halo} />
      <span className={styles.stamp}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
        {ON_LINE[locale] ?? ON_LINE.tr}
      </span>
    </div>
  );
}
