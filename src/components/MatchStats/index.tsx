import { useTranslation } from '@/lib/i18n';
import '@/lib/i18nNamespaces/matchState';
import { PanelSkeleton } from '@/components/Skeleton';
import MatchStateNote from '@/components/MatchStateNote';
import styles from './matchStats.module.scss';
import { MatchStatsData } from '@/models/domain';
import type { Match } from '@/models/liveScore';
import { matchDisplayState, specialKeepsData } from '@/utils/matchDisplayState';
import PreMatchStats from './PreMatchStats';

interface MatchStatsProps {
  stats: MatchStatsData | null;
  loading?: boolean;
  /** Verilirse boş/bekleme metinleri maçın evresine göre (başlamadı, canlı, bitti, ertelendi…). */
  match?: Match | null;
}

export default function MatchStats({ stats, loading, match }: MatchStatsProps) {
  const { t } = useTranslation('match');
  const { t: ts } = useTranslation('matchState');
  const state = match ? matchDisplayState(match) : null;

  // Ertelendi / iptal / tarih belirsiz / gecikti: istatistik olamaz → tek mesaj (veri beklenmez).
  if (state?.special && !specialKeepsData(state.special)) {
    return (
      <div className={styles.container}>
        <h3 className={styles.title}>{t('stats.title')}</h3>
        <MatchStateNote special={state.special} variant="message" />
      </div>
    );
  }

  // Başlamamış maç: SSR'daki maç bilgisiyle hemen (istatistik isteği beklenmez, kayma yok).
  if (match && state?.phase === 'PRE') {
    return <PreMatchStats match={match} title={t('stats.title')} />;
  }

  if (loading) {
    return <PanelSkeleton rows={5} />;
  }

  const renderStatBar = (homeVal: number, awayVal: number) => {
    const total = homeVal + awayVal;
    if (total === 0) return null;
    const homePct = (homeVal / total) * 100;

    return (
      <div className={styles.barContainer}>
        <div className={styles.barHome} style={{ width: `${homePct}%` }} />
        <div className={styles.barAway} style={{ width: `${100 - homePct}%` }} />
      </div>
    );
  };

  const statEntries = stats
    ? Object.entries(stats)
        .filter(([, val]) => val !== null && val !== undefined)
        .map(([key, val]) => {
          const parts = (val as string).split(':');
          return {
            key,
            label: t(`stats.${key}`, { defaultValue: key }),
            home: parts[0]?.trim() || '0',
            away: parts[1]?.trim() || '0',
          };
        })
    : [];

  return (
    <div className={styles.container}>
      <h3 className={styles.title}>{t('stats.title')}</h3>

      {state?.special && statEntries.length > 0 ? <MatchStateNote special={state.special} variant="banner" /> : null}

      {statEntries.length === 0 ? (
        state?.special ? (
          <MatchStateNote special={state.special} variant="message" />
        ) : (
          <div className={styles.empty}>
            {!state ? t('stats.empty') : state.phase === 'POST' ? ts('post.stats') : ts('live.stats')}
          </div>
        )
      ) : (
        <div className={styles.statsList}>
          {statEntries.map((stat) => (
            <div key={stat.key} className={styles.statItem}>
              <div className={styles.statLabels}>
                <span className={styles.statValue}>{stat.home}</span>
                <span className={styles.statName}>{stat.label}</span>
                <span className={styles.statValue}>{stat.away}</span>
              </div>
              {renderStatBar(parseInt(stat.home) || 0, parseInt(stat.away) || 0)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
