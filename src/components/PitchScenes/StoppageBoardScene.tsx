import { useRef } from 'react';
import { useI18n } from '@/lib/i18n';
import { useMotionPause } from '@/hooks/useMotionPause';
import turf from './turf.module.scss';
import styles from './stoppageBoardScene.module.scss';

const LABEL: Record<string, string> = { tr: 'EN AZ 4 DAKİKA', en: 'AT LEAST 4 MINUTES' };

/** 12 · Uzatma tabelası (504×230): dördüncü hakem kenar çizgisinden gelir, LED tabelada "+4" yanar. */
export default function StoppageBoardScene() {
  const { locale } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  useMotionPause(ref);
  return (
    <div ref={ref} className={`${turf.turf} ${styles.root}`} aria-hidden="true">
      <span className={turf.stripes} />
      <span className={styles.halfLine} />
      <span className={styles.halfCircle} />
      <span className={styles.side} />
      <span className={styles.touch} />
      <span className={styles.label}>{LABEL[locale] ?? LABEL.tr}</span>
      <span className={styles.board}>
        <span className={styles.pole} />
        <span className={styles.panel}>
          <span className={styles.digits}>+4</span>
          <span className={styles.dots} />
        </span>
      </span>
      <span className={styles.fourth} />
    </div>
  );
}
