import styles from './aiLoadingPitch.module.scss';

/**
 * AI analiz üretilirken gösterilen ikon tabanlı animasyon: topun iki kale
 * arasında sürekli gidip gelmesi, her varışta kısa bir "gol" flaşı. Metin
 * tabanlı "yükleniyor" ifadesi kullanılmaz — tamamen görsel.
 */
export default function AiLoadingPitch() {
  return (
    <div className={styles.wrap} role="status" aria-label="AI analizi üretiliyor">
      <div className={styles.pitch}>
        <div className={styles.stripes} aria-hidden />

        <div className={`${styles.goal} ${styles.goalLeft}`} aria-hidden>
          <span className={styles.goalNet} />
          <span className={`${styles.goalFlash} ${styles.goalFlashLeft}`} />
        </div>

        <div className={`${styles.team} ${styles.teamLeft}`} aria-hidden>
          <span className={`${styles.player} ${styles.playerHome}`} style={{ animationDelay: '0s' }} />
          <span className={`${styles.player} ${styles.playerHome}`} style={{ animationDelay: '0.35s' }} />
        </div>

        <span className={styles.ballGlow} aria-hidden />
        <span className={styles.ball} aria-hidden />

        <div className={`${styles.team} ${styles.teamRight}`} aria-hidden>
          <span className={`${styles.player} ${styles.playerAway}`} style={{ animationDelay: '0.15s' }} />
          <span className={`${styles.player} ${styles.playerAway}`} style={{ animationDelay: '0.5s' }} />
        </div>

        <div className={`${styles.goal} ${styles.goalRight}`} aria-hidden>
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
