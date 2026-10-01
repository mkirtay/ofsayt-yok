import { useRef } from 'react';
import { useDelayedShow } from '@/hooks/useDelayedShow';
import { useMotionPause } from '@/hooks/useMotionPause';
import ScaledScene from '@/components/PitchScenes/ScaledScene';
import styles from './standingsShuffle.module.scss';

const ROW_TOPS = [34, 72, 110, 148, 186];

function Arrow({ dir, wave }: { dir: 'up' | 'down'; wave: 1 | 2 }) {
  return (
    <svg
      className={`${styles.arrow} ${dir === 'up' ? styles.up : styles.down} ${wave === 1 ? styles.a1 : styles.a2}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points={dir === 'up' ? '6 15 12 9 18 15' : '6 9 12 15 18 9'} />
    </svg>
  );
}

/**
 * 04 · Puan tablosu güncelleniyor (docs/animasyon-referans/04-puan-tablosu.html) — sezon değişirken tablo kutusunun
 * İÇİNDE katman: eski tablo yerinde kalır (kayma yok), üstü soluklaşır, mini tablo üstte. 300 ms sonra görünür.
 */
export default function StandingsShuffle({ label }: { label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useMotionPause(ref);
  const shown = useDelayedShow(300);
  return (
    <div ref={ref} className={`${styles.overlay} ${shown ? '' : styles.waiting}`} role="status">
      <span className={styles.srOnly}>{label}</span>
      <div className={styles.sceneWrap} aria-hidden="true">
        <ScaledScene height={226} className={styles.stage}>
          <div className={styles.tbl}>
            <div className={styles.th}>
              <span style={{ width: 24 }}>#</span>
              <span style={{ paddingLeft: 12 }}>Takım</span>
              <span style={{ marginLeft: 'auto', paddingRight: 30 }}>P</span>
            </div>
            {ROW_TOPS.map((top, i) => (
              <span key={top} className={`${styles.rank} ${i === 0 ? styles.rank1 : ''}`} style={{ top: top + 19 }}>
                {i + 1}
              </span>
            ))}
            <div className={styles.row} style={{ top: 34 }}>
              <span className={styles.crest} style={{ background: '#1d4ed8' }} />
              <span className={styles.bar} style={{ width: 170 }} />
              <span className={styles.pts} />
              <span className={styles.noarrow} />
            </div>
            <div className={`${styles.row} ${styles.rB}`} style={{ top: 72 }}>
              <span className={styles.crest} style={{ background: '#f59e0b' }} />
              <span className={styles.bar} style={{ width: 140 }} />
              <span className={styles.pts} />
              <Arrow dir="down" wave={1} />
            </div>
            <div className={`${styles.row} ${styles.rC}`} style={{ top: 110 }}>
              <span className={styles.crest} style={{ background: '#0d9488' }} />
              <span className={styles.bar} style={{ width: 190 }} />
              <span className={styles.pts} />
              <Arrow dir="up" wave={1} />
            </div>
            <div className={`${styles.row} ${styles.rD}`} style={{ top: 148 }}>
              <span className={styles.crest} style={{ background: '#7c3aed' }} />
              <span className={styles.bar} style={{ width: 120 }} />
              <span className={styles.pts} />
              <Arrow dir="down" wave={2} />
            </div>
            <div className={`${styles.row} ${styles.rE}`} style={{ top: 186 }}>
              <span className={styles.crest} style={{ background: '#dc2626' }} />
              <span className={styles.bar} style={{ width: 160 }} />
              <span className={styles.pts} />
              <Arrow dir="up" wave={2} />
            </div>
          </div>
        </ScaledScene>
      </div>
    </div>
  );
}
