import Link from 'next/link';
import type { ReactNode } from 'react';
import { SkeletonBlock } from '@/components/Skeleton';
import { useI18n, useTranslation } from '@/lib/i18n';
import '@/lib/i18nNamespaces/team';
import type { ProfileMetric } from '@/services/sportmonks/teamSeasonProfile';
import styles from './teamDetailView.module.scss';

/** Bundan az metrik gelen kapsamda (ör. ayrıntılı veri olmayan ligler) kart gösterilmez. */
export const MIN_PROFILE_METRICS = 3;
/** İskelet hücre sayısı (tam veri gelen kapsamdaki metrik sayısı). */
const SKELETON_CELLS = 10;

type Props = {
  loading: boolean;
  error: boolean;
  metrics: ProfileMetric[];
  /** Kapsam (Sezon Özeti'nde seçili sekme). */
  scope: string;
  /** "Tümü"nde en yüksek puanlı oyuncunun turnuvası (puan sezon ortalaması, toplanamaz). */
  bestPlayerScope?: string | null;
};

type Cell = { key: string; label: string; value: ReactNode; sub?: ReactNode };

/**
 * Sezon Profili: Sezon Özeti ile aynı istatistik isteğinden şut, korner, topa sahip olma… (maç başı ortalamalar).
 * Veri yoksa / çok azsa kart hiç yok; hata "veri yok" sayılmaz (kart hata satırıyla kalır). Ekranın altında, aynı
 * sorguyla birlikte yüklenir.
 */
export default function SeasonProfileCard({ loading, error, metrics, scope, bestPlayerScope }: Props) {
  const { t } = useTranslation('team');
  const { locale } = useI18n();
  if (!loading && !error && metrics.length < MIN_PROFILE_METRICS) return null;

  const nf = new Intl.NumberFormat(locale === 'en' ? 'en-GB' : 'tr-TR', { maximumFractionDigits: 2 });
  const n = (v: number) => nf.format(v);

  const cell = (m: ProfileMetric): Cell => {
    switch (m.key) {
      case 'possession':
        return { key: m.key, label: t('profile.possession'), value: t('profile.percent', { n: n(m.value) }), sub: t('profile.perMatchAvg') };
      case 'shots':
        return {
          key: m.key,
          label: t('profile.shots'),
          value: n(m.value),
          ...(m.onTarget != null ? { sub: t('profile.onTarget', { n: n(m.onTarget) }) } : {}),
        };
      case 'corners':
        return { key: m.key, label: t('profile.corners'), value: n(m.value), sub: t('profile.perMatch') };
      case 'passes':
        return { key: m.key, label: t('profile.passes'), value: n(m.value), sub: t('profile.perMatch') };
      case 'minutesPerGoal':
        return { key: m.key, label: t('profile.minutesPerGoal'), value: t('profile.minutes', { n: n(m.value) }), sub: t('profile.minutesPerGoalSub') };
      case 'failedToScore':
        return {
          key: m.key,
          label: t('profile.failedToScore'),
          value: n(m.value),
          sub: t('profile.homeAway', { home: n(m.home), away: n(m.away) }),
        };
      case 'scoredBothHalves':
        return { key: m.key, label: t('profile.scoredBothHalves'), value: n(m.value), sub: t('profile.ofMatches', { count: m.games }) };
      case 'penalties':
        return {
          key: m.key,
          label: t('profile.penalties'),
          value: `${n(m.scored)}/${n(m.attempts)}`,
          sub: t('profile.penaltiesSub'),
        };
      case 'yellow':
        return {
          key: m.key,
          label: t('profile.yellow'),
          value: n(m.value),
          ...(m.red != null ? { sub: t('profile.red', { count: m.red }) } : { sub: t('profile.perMatch') }),
        };
      case 'bestPlayer':
        return {
          key: m.key,
          label: t('profile.bestPlayer'),
          value: n(m.value),
          sub: (
            <>
              <Link href={`/players/${m.playerId}`} prefetch={false} className={styles.profileLink}>
                {m.name}
              </Link>
              {bestPlayerScope ? ` · ${bestPlayerScope}` : null}
            </>
          ),
        };
    }
  };

  return (
    <section className={styles.statsCard} aria-busy={loading || undefined}>
      <div className={styles.cardHead}>
        <h3 className={styles.cardTitle}>{t('profile.title')}</h3>
        <span className={styles.cardScope}>{scope}</span>
      </div>

      {error && !loading ? (
        <div className={styles.summaryFoot}>
          <span>{t('profile.error')}</span>
        </div>
      ) : (
        <dl className={styles.profileGrid}>
          {loading
            ? Array.from({ length: SKELETON_CELLS }, (_, i) => (
                <div key={i} className={styles.profileCell}>
                  <SkeletonBlock width={72} height={11} />
                  <SkeletonBlock width={40} height={20} />
                  <SkeletonBlock width={56} height={11} />
                </div>
              ))
            : metrics.map(cell).map((c) => (
                <div key={c.key} className={styles.profileCell}>
                  <dt className={styles.profileLabel}>{c.label}</dt>
                  <dd className={styles.profileValue}>{c.value}</dd>
                  <dd className={styles.profileSub}>{c.sub ?? ' '}</dd>
                </div>
              ))}
        </dl>
      )}
    </section>
  );
}
