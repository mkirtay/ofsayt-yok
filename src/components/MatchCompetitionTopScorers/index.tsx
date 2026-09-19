import { useState } from 'react';
import Link from 'next/link';
import { useTranslation } from '@/lib/i18n';
import type {
  SeasonListItem,
  TopScorerEntry,
  TopScorersPayload,
} from '@/services/liveScoreService';
import SeasonSelect from '@/components/SeasonSelect';
import { formatSeasonLabel } from '@/utils/seasonLabel';
import styles from './matchCompetitionTopScorers.module.scss';

/** Gol Krallığı varsayılan görünür satır sayısı; kalanı "Tümünü Göster" ile açılır (veri zaten elde, ek istek yok). */
export const TOP_SCORERS_INITIAL_LIMIT = 20;

export function visibleScorers<T>(all: T[], expanded: boolean): T[] {
  return expanded ? all : all.slice(0, TOP_SCORERS_INITIAL_LIMIT);
}

function rankCellClass(rank: number): string {
  if (rank === 1) return `${styles.rankBadge} ${styles.rank1}`;
  if (rank === 2) return `${styles.rankBadge} ${styles.rank2}`;
  if (rank === 3) return `${styles.rankBadge} ${styles.rank3}`;
  return styles.rankPlain;
}

interface MatchCompetitionTopScorersProps {
  data: TopScorersPayload | null;
  loading?: boolean;
  seasons?: SeasonListItem[];
  selectedSeasonId?: number | null;
  onSeasonChange?: (id: number) => void;
}

export default function MatchCompetitionTopScorers({
  data,
  loading,
  seasons,
  selectedSeasonId,
  onSeasonChange,
}: MatchCompetitionTopScorersProps) {
  const { t } = useTranslation('match');
  // "Tümünü Göster" durumu sezona bağlı: sezon/lig değişince liste yeniden 20'ye döner.
  const listKey = `${data?.competition?.id ?? ''}:${data?.season?.id ?? ''}`;
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const expanded = expandedKey === listKey;

  if (loading) {
    return (
      <section className={styles.block} aria-label={t('topScorers.ariaLabel')}>
        <div className={styles.sectionDivider} aria-hidden />
        <div className={styles.loading}>{t('topScorers.loading')}</div>
      </section>
    );
  }

  const fullList = data?.topscorers ?? [];
  const list = visibleScorers(fullList, expanded);
  const hiddenCount = fullList.length - list.length;
  const seasonName = data?.season?.name;
  const showSeasonSelect = Boolean(seasons?.length && onSeasonChange);

  if (!list.length) {
    return (
      <section className={styles.block} aria-label={t('topScorers.ariaLabel')}>
        <div className={styles.sectionDivider} aria-hidden />
        <div className={styles.titleContainer}>
          <h2 className={styles.title}>{t('topScorers.title')}</h2>
          {showSeasonSelect ? (
            <SeasonSelect
              seasons={seasons!}
              value={selectedSeasonId ?? null}
              onChange={onSeasonChange!}
              selectClassName={styles.seasonSelect}
            />
          ) : seasonName ? (
            <p className={styles.season}>{t('topScorers.season', { season: formatSeasonLabel(seasonName) })}</p>
          ) : null}
        </div>
        <p className={styles.empty}>{t('topScorers.empty')}</p>
      </section>
    );
  }

  return (
    <section className={styles.block} aria-label={t('topScorers.ariaLabel')}>
      <div className={styles.sectionDivider} aria-hidden />
      <div className={styles.titleContainer}>
        <h2 className={styles.title}>{t('topScorers.title')}</h2>
        {showSeasonSelect ? (
          <SeasonSelect
            seasons={seasons!}
            value={selectedSeasonId ?? null}
            onChange={onSeasonChange!}
            selectClassName={styles.seasonSelect}
          />
        ) : seasonName ? (
          <p className={styles.season}>{t('topScorers.season', { season: formatSeasonLabel(seasonName) })}</p>
        ) : null}
      </div>
      <div className={styles.scroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.colRank}>#</th>
              <th className={styles.colPlayerTeam}>{t('topScorers.player')}</th>
              <th>{t('topScorers.played')}</th>
              <th>{t('topScorers.assists')}</th>
              <th className={styles.colGoals}>{t('topScorers.goals')}</th>
            </tr>
          </thead>
          <tbody>
            {list.map((row: TopScorerEntry, i: number) => {
              const rank = i + 1;
              const pid = row.player?.id;
              const pname = row.player?.name ?? '—';
              const photo = row.player?.photo;
              const tid = row.team?.id;
              const tname = row.team?.name ?? '—';
              const logo = row.team?.logo;
              return (
                <tr key={`${pid ?? 'p'}-${tid ?? 't'}-${i}`}>
                  <td className={styles.colRank}>
                    <span className={rankCellClass(rank)}>{rank}</span>
                  </td>
                  <td className={styles.colPlayerTeam}>
                    <div className={styles.playerTeamCell}>
                      {photo ? (
                        <img
                          src={photo}
                          alt=""
                          className={styles.playerPhoto}
                          width={18}
                          height={18}
                        />
                      ) : null}
                      {logo ? (
                        <img
                          src={logo}
                          alt=""
                          className={styles.teamLogo}
                          width={16}
                          height={16}
                        />
                      ) : null}
                      <div className={styles.nameStack}>
                        {pid != null ? (
                          <Link href={`/players/${pid}`} className={styles.playerName} prefetch={false}>
                            {pname}
                          </Link>
                        ) : (
                          <span className={styles.playerName}>{pname}</span>
                        )}
                        {tid != null ? (
                          <Link
                            href={`/teams/${tid}`}
                            className={styles.teamSubLink}
                            prefetch={false}
                          >
                            {tname}
                          </Link>
                        ) : (
                          <span className={styles.teamSubText}>{tname}</span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td>{row.played ?? '—'}</td>
                  <td>{row.assists ?? '—'}</td>
                  <td className={styles.colGoals}>{row.goals}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {hiddenCount > 0 ? (
        <button type="button" className={styles.showAll} onClick={() => setExpandedKey(listKey)}>
          {t('topScorers.showAll', { count: fullList.length })}
        </button>
      ) : null}
    </section>
  );
}
