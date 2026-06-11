import { useTranslation } from '@/lib/i18n';
import { PanelSkeleton } from '@/components/Skeleton';
import styles from './matchStats.module.scss';
import { MatchStatsData } from '@/models/domain';

interface MatchStatsProps {
  stats: MatchStatsData | null;
  loading?: boolean;
}

export default function MatchStats({ stats, loading }: MatchStatsProps) {
  const { t } = useTranslation('match');

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

      {statEntries.length === 0 ? (
        <div className={styles.empty}>{t('stats.empty')}</div>
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
