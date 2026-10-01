import { useLayoutEffect, useRef } from 'react';
import { useI18n } from '@/lib/i18n';
import type { GoalSide } from '@/utils/goalDetection';
import styles from './goalMoment.module.scss';

const LABEL: Record<string, string> = { tr: 'GOL!', en: 'GOAL!' };

/**
 * 06 · Gol anı (docs/animasyon-referans/06-gol-ani.html), 40 px'lik canlı maç satırına uyarlanmış ve TEK SEFERLİK:
 * satır yeşil yanıp söner, top golü atan taraftan skora uçar, skorun etrafında halka, golü atan tarafta "GOL!".
 * Satırın kökünde mutlak katman (tıklamayı engellemez); skor konumunu `[data-goal-anchor]` hücresinden ölçer.
 * Hareketi azalt'ta yalnız "GOL!" etiketi durağan görünür.
 */
export default function GoalMoment({ side }: { side: GoalSide }) {
  const { locale } = useI18n();
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const root = ref.current;
    const cell = root?.parentElement?.querySelector<HTMLElement>('[data-goal-anchor]');
    if (!root || !cell) return;
    const base = root.getBoundingClientRect();
    const box = cell.getBoundingClientRect();
    root.style.setProperty('--score-left', `${box.left - base.left}px`);
    root.style.setProperty('--score-right', `${base.right - box.right}px`);
    root.style.setProperty('--score-center', `${box.left - base.left + box.width / 2}px`);
  }, []);

  return (
    <div ref={ref} className={`${styles.root} ${side === 'home' ? styles.home : styles.away}`} aria-hidden="true">
      <span className={styles.flash} />
      <span className={styles.halo} />
      <span className={styles.ball} />
      <span className={styles.chip}>{LABEL[locale] ?? LABEL.tr}</span>
    </div>
  );
}
