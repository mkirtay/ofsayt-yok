import { useState, type Ref } from 'react';
import Link from 'next/link';
import { SkeletonBlock } from '@/components/Skeleton';
import TeamLogo from '@/components/TeamLogo';
import { useTranslation } from '@/lib/i18n';
import '@/lib/i18nNamespaces/team';
import { rankTeamScorers, type TeamScorer } from '@/services/sportmonks/teamScorers';
import styles from './teamDetailView.module.scss';

export const SCORERS_LIMIT = 5;

type Props = {
  cardRef?: Ref<HTMLElement>;
  loading: boolean;
  error: boolean;
  players: TeamScorer[];
  /** Kapsam ("Tüm turnuvalar" / "Süper Lig") — Sezon Özeti'nde seçili sekme. */
  scope: string;
};

/** Takımın gol / asist krallığı: hep 5 satırlık yer (boş satırlar yer tutar) → yüklenince kayma yok. */
export default function TeamScorersCard({ cardRef, loading, error, players, scope }: Props) {
  const { t } = useTranslation('team');
  const [mode, setMode] = useState<'goals' | 'assists'>('goals');
  const ranked = rankTeamScorers(players, mode, SCORERS_LIMIT);

  return (
    <section ref={cardRef} className={styles.statsCard} aria-busy={loading || undefined}>
      <div className={styles.cardHead}>
        <h3 className={styles.cardTitle}>{t('scorers.title')}</h3>
        <div className={styles.segmented} role="tablist" aria-label={t('scorers.modeAria')}>
          {(['goals', 'assists'] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              className={`${styles.segment} ${mode === m ? styles.segmentActive : ''}`.trim()}
              onClick={() => setMode(m)}
            >
              {t(`scorers.${m}`)}
            </button>
          ))}
        </div>
      </div>

      <ol className={styles.scorersList}>
        {Array.from({ length: SCORERS_LIMIT }, (_, i) => {
          const p = ranked[i];
          if (loading) {
            return (
              <li key={i} className={styles.scorerRow} aria-hidden="true">
                <SkeletonBlock width={24} height={24} className={styles.scorerPhoto} />
                <SkeletonBlock width="55%" height={12} />
              </li>
            );
          }
          if (!p) return <li key={i} className={`${styles.scorerRow} ${styles.scorerRowEmpty}`} aria-hidden="true" />;
          const value = p[mode];
          const other = mode === 'goals' ? p.assists : p.goals;
          return (
            <li key={p.playerId} className={styles.scorerRow}>
              <Link href={`/players/${p.playerId}`} prefetch={false} className={styles.scorerLink}>
                <span className={styles.scorerRank}>{i + 1}</span>
                {p.photo ? (
                  <TeamLogo src={p.photo} alt="" className={styles.scorerPhoto} width={24} height={24} />
                ) : (
                  <span className={`${styles.scorerPhoto} ${styles.squadPhotoEmpty}`} aria-hidden="true" />
                )}
                <span className={styles.scorerName}>{p.name}</span>
                <span className={styles.scorerOther} title={t(mode === 'goals' ? 'scorers.assists' : 'scorers.goals')}>
                  {other > 0 ? t(mode === 'goals' ? 'scorers.assistsShort' : 'scorers.goalsShort', { count: other }) : ''}
                </span>
                <span className={styles.scorerValue}>{value}</span>
              </Link>
            </li>
          );
        })}
      </ol>

      <div className={styles.summaryFoot}>
        {loading ? null : error ? (
          <span>{t('scorers.error')}</span>
        ) : ranked.length === 0 ? (
          <span>{t(mode === 'goals' ? 'scorers.emptyGoals' : 'scorers.emptyAssists')}</span>
        ) : (
          <span>{scope}</span>
        )}
      </div>
    </section>
  );
}
