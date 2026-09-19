import Link from 'next/link';
import type { CompetitionTableData } from '@/services/liveScoreService';
import { pickMiniStandingsRows } from '@/utils/miniStandings';
import { StandingsSkeleton } from '@/components/Skeleton';
import styles from './hubWidgets.module.scss';

type Props = {
  data: CompetitionTableData | null;
  loading: boolean;
  competitionName: string;
  /** "Tümü" tıklaması — ana sayfada sol paneli Puan Durumu sekmesine getirir */
  onShowAll?: () => void;
};

/** Genel puan durumu özeti (ilk 8). Veri, sol panelle aynı `useCompetitionSidebar` sorgusundan gelir (ek istek yok). */
export default function MiniStandingsWidget({ data, loading, competitionName, onShowAll }: Props) {
  const rows = pickMiniStandingsRows(data, 8);

  return (
    <section className={styles.widget}>
      <header className={styles.widgetHead}>
        <h3 className={styles.widgetTitle}>{competitionName} · Puan Durumu</h3>
        {onShowAll ? (
          <button type="button" className={styles.widgetLink} onClick={onShowAll}>
            Tümü
          </button>
        ) : null}
      </header>
      {loading ? (
        <StandingsSkeleton />
      ) : rows.length === 0 ? (
        <p className={styles.widgetNote}>Puan durumu şu an mevcut değil.</p>
      ) : (
        <ol className={styles.miniList}>
          {rows.map((r) => {
            const id = r.team?.id ?? r.team_id;
            const name = r.team?.name || r.name || '—';
            const logo = r.team?.logo || r.logo;
            const body = (
              <>
                <span className={styles.miniRank}>{r.rank}</span>
                {logo ? <img src={logo} alt="" width={18} height={18} className={styles.miniLogo} /> : <span className={styles.miniLogoPh} />}
                <span className={styles.miniName}>{name}</span>
                <span className={styles.miniPts}>{r.points}</span>
              </>
            );
            return (
              <li key={`${id ?? name}-${r.rank}`}>
                {id != null ? (
                  <Link href={`/teams/${id}`} className={styles.miniRow}>
                    {body}
                  </Link>
                ) : (
                  <div className={styles.miniRow}>{body}</div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
