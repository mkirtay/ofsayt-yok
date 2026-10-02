import { useRef } from 'react';
import { useI18n } from '@/lib/i18n';
import { useMotionPause } from '@/hooks/useMotionPause';
import turf from './turf.module.scss';
import styles from './aggregateScene.module.scss';

// Genel bir skor bandı (belirli bir yayıncının grafiği ya da kulüp kısaltması değil).
const TEXT: Record<string, { leg: string; home: string; away: string; total: string; level: string; extra: string }> = {
  tr: { leg: '2. MAÇ', home: 'EV', away: 'DEP', total: 'Toplam', level: 'EŞİT', extra: 'UZATMA' },
  en: { leg: '2ND LEG', home: 'HOME', away: 'AWAY', total: 'Aggregate', level: 'LEVEL', extra: 'EXTRA TIME' },
};

/** 15 · Toplam skor bandı (504×230): "EV 1–1 DEP" → "Toplam 2–2 · EŞİT" → UZATMA. */
export default function AggregateScene() {
  const { locale } = useI18n();
  const text = TEXT[locale] ?? TEXT.tr;
  const ref = useRef<HTMLDivElement>(null);
  useMotionPause(ref);
  return (
    <div ref={ref} className={`${turf.turf} ${styles.root}`} aria-hidden="true">
      <span className={turf.stripes} />
      <span className={turf.centerLine} />
      <span className={styles.circle} />
      <span className={styles.dim} />
      <div className={styles.bug}>
        <span className={styles.leg}>{text.leg}</span>
        <span className={styles.team}>
          <span className={`${styles.kit} ${styles.kitHome}`} />
          {text.home}
        </span>
        <span className={styles.score}>
          <span>1–1</span>
        </span>
        <span className={styles.team}>
          {text.away}
          <span className={`${styles.kit} ${styles.kitAway}`} />
        </span>
        <span className={styles.clock}>90&apos;</span>
      </div>
      <div className={styles.aggClip}>
        <div className={styles.agg}>
          {text.total} <b>2–2</b>
          <span className={styles.level}>{text.level}</span>
        </div>
      </div>
      <span className={styles.extra}>{text.extra}</span>
    </div>
  );
}
