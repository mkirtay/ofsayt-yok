import { useRef } from 'react';
import { useDelayedShow } from '@/hooks/useDelayedShow';
import { useMotionPause } from '@/hooks/useMotionPause';
import styles from './aiLoadingPitch.module.scss';

/**
 * AI analiz üretilirken gösterilen ikon tabanlı animasyon (docs/animasyon-referans/01-mac-oynaniyor.html): topun
 * iki kale arasında sürekli gidip gelmesi, her varışta kısa bir "gol" flaşı. Görsel aria-hidden; durum metni
 * (`label`) yalnız ekran okuyucuya. Kutu hemen yer kaplar, animasyon 300 ms sonra görünür (kısa beklemede hiç).
 */
export default function AiLoadingPitch({ label }: { label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useMotionPause(ref);
  const shown = useDelayedShow(300);
  return (
    <div ref={ref} className={`${styles.wrap} ${shown ? '' : styles.waiting}`} role="status">
      <span className={styles.srOnly}>{label}</span>
      <div className={styles.pitch} aria-hidden>
        <div className={styles.stripes} />

        <div className={`${styles.goal} ${styles.goalLeft}`}>
          <span className={styles.goalNet} />
          <span className={`${styles.goalFlash} ${styles.goalFlashLeft}`} />
        </div>

        <div className={`${styles.team} ${styles.teamLeft}`}>
          <span className={`${styles.player} ${styles.playerHome}`} style={{ animationDelay: '0s' }} />
          <span className={`${styles.player} ${styles.playerHome}`} style={{ animationDelay: '0.35s' }} />
        </div>

        <div className={styles.ballTrack}>
          <span className={styles.ballGlow} />
          <span className={styles.ball} />
        </div>

        <div className={`${styles.team} ${styles.teamRight}`}>
          <span className={`${styles.player} ${styles.playerAway}`} style={{ animationDelay: '0.15s' }} />
          <span className={`${styles.player} ${styles.playerAway}`} style={{ animationDelay: '0.5s' }} />
        </div>

        <div className={`${styles.goal} ${styles.goalRight}`}>
          <span className={styles.goalNet} />
          <span className={`${styles.goalFlash} ${styles.goalFlashRight}`} />
        </div>
      </div>

      <div className={styles.progressTrack} aria-hidden>
        <span className={styles.progressFill} />
      </div>
    </div>
  );
}
