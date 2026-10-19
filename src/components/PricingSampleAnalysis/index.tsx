/**
 * Fiyatlandırma sayfası örnek analizi: bitmiş gerçek bir maçın AI analizi, maç sayfasındaki bileşenle (MatchAnalysis)
 * aynı görünümde. Veri sabit kopya (src/content/pricingSampleAnalysis.json; canlı API `?v=2` yanıtından, maç bitince
 * herkese açık) — sayfa statik kalır, istek / kredi / Sportmonks kotası harcamaz. Maçı değiştirmek: JSON'u yenile.
 */
import Link from 'next/link';
import { useI18n, useTranslation } from '@/lib/i18n';
import '@/lib/i18nNamespaces/credits';
import MatchAnalysis from '@/components/MatchAnalysis';
import type { ApiAnalysis, ApiPredictionRecord } from '@/components/MatchAnalysis/types';
import type { MatchAnalysisState } from '@/hooks/useMatchAnalysis';
import sample from '@/content/pricingSampleAnalysis.json';
import styles from './pricingSampleAnalysis.module.scss';

const analysis = sample.analysis as unknown as ApiAnalysis;
const predictionRecord = sample.predictionRecord as ApiPredictionRecord;

/** Maç bitmiş, analiz açık: MatchAnalysis yalnız okuma modunda (üretim / açma yolu yok). */
const STATE: MatchAnalysisState = {
  analysis,
  preview: null,
  locked: false,
  offer: null,
  predictionRecord,
  serverPhase: 'POST',
  loading: false,
  generating: false,
  error: null,
  credits: 0,
  unlimited: false,
  isAuthenticated: false,
  generate: async () => {},
};

export default function PricingSampleAnalysis() {
  const { t } = useTranslation('credits');
  const { locale } = useI18n();
  const { meta } = sample;
  const hits = Object.values(predictionRecord.extendedHits ?? {}).filter((v) => v !== null);
  const date = new Date(`${meta.kickoffDate}T12:00:00Z`).toLocaleDateString(locale === 'en' ? 'en-GB' : 'tr-TR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <section className={styles.wrap} aria-labelledby="pricing-sample-title">
      <div className={styles.intro}>
        <span className={styles.badge}>{t('sample.badge')}</span>
        <h2 id="pricing-sample-title" className={styles.title}>
          {t('sample.title')}
        </h2>
        <p className={styles.desc}>{t('sample.desc')}</p>
      </div>

      <div className={styles.scoreCard}>
        <div className={styles.meta}>
          {meta.competition} · {date}
        </div>
        <div className={styles.scoreRow}>
          <span className={styles.team}>{analysis.homeTeamName}</span>
          <span className={styles.score} aria-label={`${t('sample.finalScore')}: ${meta.homeScore}-${meta.awayScore}`}>
            {meta.homeScore} - {meta.awayScore}
          </span>
          <span className={`${styles.team} ${styles.teamAway}`}>{analysis.awayTeamName}</span>
        </div>
        <div className={styles.predRow}>
          {t('sample.predicted')}: <strong>{analysis.scorePrediction.mostLikely}</strong>
        </div>
        <ul className={styles.hits}>
          {predictionRecord.result1x2Hit ? <li className={styles.hit}>✓ {t('sample.hit1x2')}</li> : null}
          {predictionRecord.scoreExactHit ? <li className={styles.hit}>✓ {t('sample.hitScore')}</li> : null}
          {hits.length > 0 ? (
            <li className={styles.hitNeutral}>
              {t('sample.markets', { hit: hits.filter(Boolean).length, total: hits.length })}
            </li>
          ) : null}
        </ul>
        <Link href={`/matches/${analysis.matchId}`} className={styles.matchLink} prefetch={false}>
          {t('sample.openMatch')} →
        </Link>
      </div>

      <div className={styles.analysisScroll} tabIndex={0} aria-label={t('sample.badge')}>
        <MatchAnalysis match={null} state={STATE} archived />
      </div>
    </section>
  );
}
