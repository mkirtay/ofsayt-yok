import { useRef } from 'react';
import { useI18n } from '@/lib/i18n';
import { useMotionPause } from '@/hooks/useMotionPause';
import turf from './turf.module.scss';
import styles from './keeperCountdownScene.module.scss';

const CORNER: Record<string, string> = { tr: 'KORNER', en: 'CORNER' };
const SEGMENTS = [0, 1, 2, 3, 4, 5, 6, 7];
const DIGITS = [8, 7, 6, 5, 4, 3, 2, 1, 0];
/** Halka çevresi (r=56) ve dilim boyu: 8 dilim, aralarında 6 px boşluk. */
const CIRCUMFERENCE = 351.86;
const SEGMENT = 38;

/**
 * 13 · Kalecinin 8 saniyesi (504×230): top kalecide, 8 dilimli halka her saniye bir dilim söner, sayı 8→0. Son 5 sn
 * sarı ve hakemin eli (her saniye bir parmak iner); 0'da KORNER. Rakamlar üst üste, her biri kendi saniyesinde görünür.
 */
export default function KeeperCountdownScene() {
  const { locale } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  useMotionPause(ref);
  return (
    <div ref={ref} className={`${turf.turf} ${styles.root}`} aria-hidden="true">
      <span className={turf.stripes} />
      <svg className={styles.marks} width="504" height="230" viewBox="0 0 504 230" fill="none" stroke="rgba(255,255,255,.4)" strokeWidth="2">
        <rect x="-2" y="25" width="132" height="180" />
        <rect x="-2" y="73" width="48" height="84" />
        <rect x="-4" y="90" width="12" height="50" stroke="rgba(255,255,255,.9)" strokeWidth="3" />
      </svg>
      <span className={styles.keeper} />
      <span className={`${turf.ball} ${styles.ball}`} />
      <svg className={styles.ring} viewBox="0 0 140 140" fill="none" strokeWidth="7" strokeLinecap="round">
        <circle className={styles.track} cx="70" cy="70" r="56" />
        {SEGMENTS.map((i) => (
          <circle
            key={i}
            className={`${styles.seg} ${styles[`s${i}`]}`}
            cx="70"
            cy="70"
            r="56"
            strokeDasharray={`${SEGMENT} ${CIRCUMFERENCE - SEGMENT}`}
            transform={`rotate(${-90 + i * 45 + 3.07} 70 70)`}
          />
        ))}
      </svg>
      {DIGITS.map((n) => (
        <span key={n} className={`${styles.digit} ${styles[`d${n}`]}`}>
          {n}
        </span>
      ))}
      <span className={styles.hand}>
        <span className={styles.thumb}>
          <span className={`${styles.finger} ${styles.f1}`} />
        </span>
        <span className={`${styles.finger} ${styles.f2}`} />
        <span className={`${styles.finger} ${styles.f3}`} />
        <span className={`${styles.finger} ${styles.f4}`} />
        <span className={`${styles.finger} ${styles.f5}`} />
        <span className={styles.palm} />
      </span>
      <span className={styles.stamp}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="5" y1="22" x2="5" y2="3" />
          <path d="M5 3 L18 7 L5 11" fill="#ef4444" stroke="#ef4444" />
        </svg>
        {CORNER[locale] ?? CORNER.tr}
      </span>
    </div>
  );
}
