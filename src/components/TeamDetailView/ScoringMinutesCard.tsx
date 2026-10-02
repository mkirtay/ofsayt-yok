import { useTranslation } from '@/lib/i18n';
import '@/lib/i18nNamespaces/team';
import { MINUTE_BUCKETS } from '@/services/sportmonks/teamSeasonStats';
import styles from './teamDetailView.module.scss';

type Props = {
  loading: boolean;
  error: boolean;
  scored: number[];
  conceded: number[];
  /** Kapsam (Sezon Özeti'nde seçili sekme). */
  scope: string;
};

/**
 * Gollerin 15 dakikalık dağılımı (atılan / yenilen) — yalnız CSS çubuklar (grafik kütüphanesi yok). Çubuk alanı sabit
 * yükseklikte; yüklenirken çubuklar sıfır yükseklikte durur → veri gelince kart boyu değişmez.
 */
export default function ScoringMinutesCard({ loading, error, scored, conceded, scope }: Props) {
  const { t } = useTranslation('team');
  const max = Math.max(1, ...scored, ...conceded);
  const total = scored.reduce((a, b) => a + b, 0) + conceded.reduce((a, b) => a + b, 0);
  const pct = (v: number) => `${Math.round((v / max) * 100)}%`;

  return (
    <section className={styles.statsCard} aria-busy={loading || undefined}>
      <div className={styles.cardHead}>
        <h3 className={styles.cardTitle}>{t('minutes.title')}</h3>
        <span className={styles.cardScope}>{scope}</span>
      </div>

      <div className={styles.minutesChart} role="img" aria-label={t('minutes.aria', { scope })}>
        {MINUTE_BUCKETS.map((bucket, i) => {
          const s = loading || error ? 0 : (scored[i] ?? 0);
          const c = loading || error ? 0 : (conceded[i] ?? 0);
          return (
            <div key={bucket} className={styles.minutesGroup}>
              <div className={styles.minutesBars}>
                <div className={styles.minutesBarCol}>
                  <span className={styles.minutesValue}>{loading || error ? '' : s}</span>
                  <span className={`${styles.minutesBar} ${styles.minutesBarScored}`} style={{ height: pct(s) }} />
                </div>
                <div className={styles.minutesBarCol}>
                  <span className={styles.minutesValue}>{loading || error ? '' : c}</span>
                  <span className={`${styles.minutesBar} ${styles.minutesBarConceded}`} style={{ height: pct(c) }} />
                </div>
              </div>
              <span className={styles.minutesLabel}>{bucket}</span>
            </div>
          );
        })}
      </div>

      <div className={styles.summaryFoot}>
        {loading ? null : error ? (
          <span>{t('summary.error')}</span>
        ) : total === 0 ? (
          <span>{t('minutes.empty')}</span>
        ) : (
          <span className={styles.minutesLegend}>
            <span className={`${styles.minutesSwatch} ${styles.minutesBarScored}`} aria-hidden="true" />
            {t('minutes.scored')}
            <span className={`${styles.minutesSwatch} ${styles.minutesBarConceded}`} aria-hidden="true" />
            {t('minutes.conceded')}
            <span className={styles.minutesNote}>{t('minutes.note')}</span>
          </span>
        )}
      </div>
    </section>
  );
}
