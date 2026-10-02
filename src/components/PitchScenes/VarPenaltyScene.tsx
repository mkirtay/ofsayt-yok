import { useRef } from 'react';
import { useI18n } from '@/lib/i18n';
import { useMotionPause } from '@/hooks/useMotionPause';
import turf from './turf.module.scss';
import styles from './varPenaltyScene.module.scss';

// Sahne yazıları sahnenin parçası (VarScene'deki gibi çeviri dosyası yerine burada).
const TEXT: Record<string, { review: string; decision: string }> = {
  tr: { review: 'VAR İNCELEMESİ', decision: 'PENALTI' },
  en: { review: 'VAR REVIEW', decision: 'PENALTY' },
};

/** 11 · VAR: Penaltı (504×230). Hücumcu (dolu) ceza sahasında rakiple (boş) çakışır → VAR incelemesi → penaltı. */
export default function VarPenaltyScene() {
  const { locale } = useI18n();
  const text = TEXT[locale] ?? TEXT.tr;
  const ref = useRef<HTMLDivElement>(null);
  useMotionPause(ref);
  return (
    <div ref={ref} className={`${turf.turf} ${styles.root}`} aria-hidden="true">
      <span className={turf.stripes} />
      <svg className={styles.marks} width="504" height="230" viewBox="0 0 504 230" fill="none" stroke="rgba(255,255,255,.4)" strokeWidth="2">
        <rect x="374" y="25" width="132" height="180" />
        <rect x="458" y="73" width="48" height="84" />
        <path d="M374 85 A 56 56 0 0 0 374 145" />
        <circle cx="416" cy="115" r="2.5" fill="rgba(255,255,255,.6)" stroke="none" />
        <rect x="496" y="90" width="12" height="50" stroke="rgba(255,255,255,.9)" strokeWidth="3" />
      </svg>
      <span className={styles.freeze} />
      <span className={`${styles.player} ${styles.def}`} />
      <span className={`${styles.player} ${styles.atk}`} />
      <span className={`${turf.ball} ${styles.ball}`} />
      <span className={styles.hit} />
      <span className={styles.focus} />
      <span className={styles.var}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="5" width="18" height="12" rx="2" />
          <line x1="8" y1="21" x2="16" y2="21" />
        </svg>
        {text.review}
        <span className={styles.rec} />
      </span>
      <span className={styles.stamp}>
        <span className={styles.spot} />
        {text.decision}
      </span>
    </div>
  );
}
