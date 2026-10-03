import Link from 'next/link';
import { useTranslation } from '@/lib/i18n';
import type { AnalysisOffer, UnlockMethod } from '@/hooks/useMatchAnalysis';
import type { AnalysisPreview } from '@/utils/analysisPreview';
import { LOCKED_SECTION_CLASS } from '@/utils/analysisPaywall';
import styles from './matchAnalysis.module.scss';

/**
 * Kredi modeli v2 — kilitli analiz: ücretsiz önizleme (kısa özet + ana olasılık) + kilitli bölümlerin yalnız
 * BAŞLIKLARI + açma düğmeleri. Kilitli içerik bu bileşene hiç gelmez (API vermez). Kilitli bölümün sınıfı
 * (utils/analysisPaywall.ts) maç sayfasının ücretli içerik işaretlemesindeki seçicidir.
 */
const LOCKED_SECTIONS = ['scenarios', 'score', 'teams', 'absences', 'analyst'] as const;

type Props = {
  preview: AnalysisPreview;
  offer: AnalysisOffer | null;
  loading: boolean;
  busy: boolean;
  error: string | null;
  isAuthenticated: boolean;
  onUnlock: (method: UnlockMethod) => void;
};

export default function LockedPreview({ preview, offer, loading, busy, error, isAuthenticated, onUnlock }: Props) {
  const { t } = useTranslation('match');
  const top = preview.top;
  const topLabel = top
    ? top.outcome === 'DRAW'
      ? t('analysis.topOutcomeDraw')
      : t(top.outcome === 'HOME' ? 'analysis.topOutcomeHome' : 'analysis.topOutcomeAway', {
          team: top.outcome === 'HOME' ? preview.homeTeamName : preview.awayTeamName,
        })
    : null;
  const disabled = loading || busy;

  return (
    <div className={styles.card}>
      <div className={styles.headerRow}>
        <h3 className={styles.title}>
          <span className={styles.aiBadge}>AI</span>
          {t('analysis.titleShort')}
          <span className={styles.premiumBadge}>{t('premiumBadge')}</span>
        </h3>
        <span className={styles.previewTag}>{t('analysis.previewLabel')}</span>
      </div>

      {preview.summary.length > 0 ? (
        <ul className={styles.previewSummary}>
          {preview.summary.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}

      {top && topLabel ? (
        <div className={styles.previewTop}>
          <span className={styles.previewTopLabel}>{topLabel}</span>
          <span className={styles.previewTopPct}>%{top.pct}</span>
          <span className={styles.previewTopBar} aria-hidden="true">
            <span style={{ width: `${Math.min(100, Math.max(0, top.pct))}%` }} />
          </span>
        </div>
      ) : null}

      <section className={`${styles.lockedSection} ${LOCKED_SECTION_CLASS}`} aria-label={t('analysis.lockedTitle')}>
        <h4 className={styles.lockedTitle}>
          <span aria-hidden="true">🔒</span> {t('analysis.lockedTitle')}
        </h4>
        <ul className={styles.lockedList}>
          {LOCKED_SECTIONS.map((k) => (
            <li key={k} className={styles.lockedItem}>
              <span>{t(`analysis.lockedSections.${k}`)}</span>
              <span className={styles.lockedBlur} aria-hidden="true" />
            </li>
          ))}
        </ul>
      </section>

      <div className={styles.cta}>
        {error ? <div className={styles.errorBox}>{error}</div> : null}
        {!isAuthenticated ? (
          <>
            <p className={styles.reasoning}>{t('analysis.signInToUnlock')}</p>
            <Link href="/auth/signin" className={styles.ctaButton}>
              {t('analysis.signIn')}
            </Link>
          </>
        ) : offer?.free ? (
          <button type="button" className={styles.ctaButton} disabled={disabled} onClick={() => onUnlock('credit')}>
            {t(offer.admin ? 'analysis.unlockAdmin' : 'analysis.unlockPremium')}
          </button>
        ) : (
          <>
            {offer?.weeklyFree.available ? (
              <button type="button" className={styles.ctaButton} disabled={disabled} onClick={() => onUnlock('weekly_free')}>
                {t('analysis.unlockWeekly')}
              </button>
            ) : null}
            {offer && offer.balance < offer.cost ? (
              <Link href="/credits" className={styles.ctaButton}>
                {t('analysis.buyCredits')}
              </Link>
            ) : (
              <button
                type="button"
                className={offer?.weeklyFree.available ? styles.ctaButtonSecondary : styles.ctaButton}
                disabled={disabled || !offer}
                onClick={() => onUnlock('credit')}
              >
                {t('analysis.unlockCredit')}
              </button>
            )}
            {offer ? (
              <p className={styles.reasoning}>
                {t('analysis.creditBalance', { credits: offer.balance })}
                {offer.weeklyFree.reason && offer.weeklyFree.reason !== 'SIGNED_OUT'
                  ? ` · ${t(`analysis.weeklyReason.${offer.weeklyFree.reason}`)}`
                  : ''}
              </p>
            ) : null}
          </>
        )}
        <p className={styles.reasoning}>{t('analysis.unlockPermanent')}</p>
      </div>
    </div>
  );
}
