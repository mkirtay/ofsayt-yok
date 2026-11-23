import Link from 'next/link';
import BuyCreditsButton from '@/components/BuyCredits';
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
/** Panelde ✓ ile sayılan kazanımlar (yalnız analizde gerçekten olanlar). */
const PAYWALL_POINTS = ['scenarios', 'score', 'teams', 'absences', 'analyst'] as const;

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

      {/* Kilitli bölüm: açılmış analizin kendi iskeleti (aynı 1/X/2 kutuları ve bölüm başlıkları), değerler bulanık
          yer tutucu — gerçek değer HTML'de yok, sayılar yalnız CSS. Kilit dili premium amber (Design System §1). */}
      <div className={styles.lockWrap}>
        <section className={`${styles.lockedSection} ${LOCKED_SECTION_CLASS}`} aria-label={t('analysis.lockedTitle')}>
          <div className={styles.ghost} aria-hidden="true" data-nosnippet="">
            <h4 className={styles.sectionTitle}>{t('analysis.lockedSections.scenarios')}</h4>
            <div className={styles.predictionBars}>
              {(['home', 'draw', 'away'] as const).map((k) => (
                <div key={k} className={styles.predictionBar}>
                  <div className={styles.barLabel}>{t(`analysis.pick.${k}`)}</div>
                  <div className={`${styles.barValue} ${styles.ghostValue}`} />
                  <div className={styles.barTeam}>
                    {k === 'home' ? preview.homeTeamName : k === 'away' ? preview.awayTeamName : '\u00a0'}
                  </div>
                </div>
              ))}
            </div>
            <div className={styles.ghostGrid}>
              {LOCKED_SECTIONS.filter((k) => k !== 'scenarios').map((k) => (
                <div key={k} className={styles.ghostTile}>
                  <span className={styles.ghostTileTitle}>{t(`analysis.lockedSections.${k}`)}</span>
                  <span className={styles.ghostLine} />
                  <span className={`${styles.ghostLine} ${styles.ghostLineShort}`} />
                </div>
              ))}
            </div>
          </div>
          <div className={styles.lockPanel}>
            <span className={styles.lockChip}>
              <span aria-hidden="true">🔒</span> {t('analysis.lockedTitle')}
            </span>
            <ul className={styles.lockChecks}>
              {PAYWALL_POINTS.map((k) => (
                <li key={k}>{t(`analysis.paywall.points.${k}`)}</li>
              ))}
            </ul>
          </div>
        </section>
        <div className={styles.cta}>
          {error ? <div className={styles.errorBox}>{error}</div> : null}
          {!isAuthenticated ? (
            <>
              <p className={styles.reasoning}>{t('analysis.signInToUnlock')}</p>
              <Link href="/auth/signup?src=analysis_lock" className={styles.ctaButton}>
                {t('analysis.signUpGift')}
              </Link>
              <p className={styles.reasoning}>
                {t('analysis.haveAccount')} <Link href="/auth/signin">{t('analysis.signIn')}</Link>
              </p>
            </>
          ) : offer?.free ? (
            <button type="button" className={styles.ctaButton} disabled={disabled} onClick={() => onUnlock('credit')}>
              {t(offer.admin ? 'analysis.unlockAdmin' : 'analysis.unlockFree')}
            </button>
          ) : (
            <>
              {offer?.weeklyFree.available ? (
                <button type="button" className={styles.ctaButton} disabled={disabled} onClick={() => onUnlock('weekly_free')}>
                  {t('analysis.unlockWeekly')}
                </button>
              ) : null}
              {offer && offer.balance < offer.cost ? (
                <BuyCreditsButton className={styles.ctaButton}>{t('analysis.buyCredits')}</BuyCreditsButton>
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

      {offer?.proof ? (
        <p className={styles.proofLine}>
          <span aria-hidden="true">✓ </span>
          {t('analysis.recentProof', {
            days: offer.proof.days,
            hits: offer.proof.hits,
            picks: offer.proof.picks,
            rate: ((offer.proof.hits / offer.proof.picks) * 100).toLocaleString('tr-TR', { maximumFractionDigits: 1 }),
          })}{' '}
          <Link href="/ai-istatistikleri">{t('analysis.recentProofLink')}</Link>
        </p>
      ) : null}

      <div className={styles.disclaimer}>{t('analysis.disclaimer')}</div>
    </div>
  );
}
