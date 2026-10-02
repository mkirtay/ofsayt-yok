import type { ReactNode, Ref } from 'react';
import { SkeletonBlock } from '@/components/Skeleton';
import TeamLogo from '@/components/TeamLogo';
import { useTranslation } from '@/lib/i18n';
import '@/lib/i18nNamespaces/team';
import type { SummaryLine, TeamSeasonStats } from '@/services/sportmonks/teamSeasonStats';
import styles from './teamDetailView.module.scss';

export type TournamentTab = { key: string; label: string; fullLabel?: string; logo?: string; logoBackdrop?: boolean };

type Props = {
  cardRef?: Ref<HTMLElement>;
  /** Veri henüz yok (görünür alana gelmedi ya da istek sürüyor): aynı ölçüde iskelet. */
  loading: boolean;
  error: boolean;
  tabs: TournamentTab[];
  selected: string;
  onSelect: (key: string) => void;
  stats: TeamSeasonStats | null;
  /** Lig satırı ("Süper Lig · 2. sıra · 13 puan") — yalnız lig sekmesinde/Tümü'nde; yoksa satır boş kalır. */
  footer?: string | null;
  /** Başlığın sağı (geçmiş sezonlar: sezon seçici). */
  headerRight?: ReactNode;
};

const ROWS: { key: 'total' | 'home' | 'away'; label: string }[] = [
  { key: 'total', label: 'summary.total' },
  { key: 'home', label: 'summary.home' },
  { key: 'away', label: 'summary.away' },
];

const COLS: { key: keyof SummaryLine; label: string; title: string }[] = [
  { key: 'played', label: 'summary.colPlayed', title: 'summary.colPlayedTitle' },
  { key: 'won', label: 'summary.colWon', title: 'summary.colWonTitle' },
  { key: 'drawn', label: 'summary.colDrawn', title: 'summary.colDrawnTitle' },
  { key: 'lost', label: 'summary.colLost', title: 'summary.colLostTitle' },
  { key: 'goalsFor', label: 'summary.colFor', title: 'summary.colForTitle' },
  { key: 'goalsAgainst', label: 'summary.colAgainst', title: 'summary.colAgainstTitle' },
  { key: 'cleanSheets', label: 'summary.colClean', title: 'summary.colCleanTitle' },
];

/**
 * Sezon Özeti: turnuva sekmeleri (Tümü + oynanan turnuvalar), Toplam / İç saha / Deplasman satırları.
 * Kart yüksekliği sabit (sekme satırı tek satır, tablo hep 3 satır, alt satır hep var) → yüklenince kayma yok.
 */
export default function SeasonSummaryCard({ cardRef, loading, error, tabs, selected, onSelect, stats, footer, headerRight }: Props) {
  const { t } = useTranslation('team');
  const empty = !loading && !error && (!stats || stats.total.played === 0);

  return (
    <section ref={cardRef} className={styles.statsCard} aria-busy={loading || undefined}>
      <div className={styles.cardHead}>
        <h3 className={styles.cardTitle}>{t('summary.title')}</h3>
        {headerRight}
      </div>

      <div className={styles.summaryTabs} role="tablist" aria-label={t('summary.tabsAria')}>
        {loading ? (
          <>
            <SkeletonBlock width={56} height={24} />
            <SkeletonBlock width={88} height={24} />
            <SkeletonBlock width={112} height={24} />
          </>
        ) : (
          tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={selected === tab.key}
              title={tab.fullLabel ?? tab.label}
              className={`${styles.summaryTab} ${selected === tab.key ? styles.summaryTabActive : ''}`.trim()}
              onClick={() => onSelect(tab.key)}
            >
              {tab.logo ? (
                <TeamLogo
                  src={tab.logo}
                  alt=""
                  className={`${styles.fixtureCompLogo} ${tab.logoBackdrop ? styles.logoBackdrop : ''}`.trim()}
                  width={14}
                  height={14}
                />
              ) : null}
              <span>{tab.label}</span>
            </button>
          ))
        )}
      </div>

      <table className={styles.summaryTable}>
        <thead>
          <tr>
            <th scope="col">
              <span className={styles.srOnly}>{t('summary.rowHeader')}</span>
            </th>
            {COLS.map((c) => (
              <th key={c.key} scope="col" title={t(c.title)}>
                <abbr title={t(c.title)}>{t(c.label)}</abbr>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ROWS.map((r) => (
            <tr key={r.key}>
              <th scope="row">{t(r.label)}</th>
              {COLS.map((c) => (
                <td key={c.key}>
                  {loading ? (
                    <SkeletonBlock className={styles.summaryCellSkeleton} width={16} height={12} />
                  ) : error || !stats ? (
                    '–'
                  ) : (
                    stats[r.key][c.key]
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <div className={styles.summaryFoot}>
        {loading ? null : error ? (
          <span>{t('summary.error')}</span>
        ) : empty ? (
          <span>{t('summary.empty')}</span>
        ) : footer ? (
          <span>{footer}</span>
        ) : null}
      </div>
    </section>
  );
}
