import { useMemo, useState } from 'react';
import Link from 'next/link';
import { SkeletonBlock } from '@/components/Skeleton';
import TeamLogo from '@/components/TeamLogo';
import { useTranslation } from '@/lib/i18n';
import '@/lib/i18nNamespaces/team';
import type { TeamMatch } from '@/services/sportmonks/teamOverview';
import { competitionLogoNeedsBackdrop } from '@/utils/competitionLogo';
import { leagueNameById } from '@/utils/leagueName';
import { buildMatchHref } from '@/utils/matchUrl';
import { fullMatchDate, recentMatchStatus } from './recentMatchLabels';
import { buildRecentItems, initialRecentCount, visibleRecentItems } from './recentSeasonItems';
import { formatSeasonLabel } from '@/utils/seasonLabel';
import styles from './teamDetailView.module.scss';

export const RECENT_PAGE_SIZE = 10;

type Props = {
  matches: TeamMatch[];
  loading: boolean;
  error?: boolean;
  /** Liste değişince (takım/sezon) "Daha fazla" sayacını sıfırlamak için çağıran `key` verir. */
  pageSize?: number;
  /** Maçın sezonu ("2025/2026"); verilirse sezon değiştiği yerde ayraç satırı çizilir. */
  seasonOf?: (m: TeamMatch) => string | null | undefined;
  /** Seçili (güncel) sezon — ilk maç bundan farklıysa en başta da ayraç. */
  currentSeason?: string | null;
};

/**
 * Son Maçlar. İlk 10 satır; "Daha fazla" her tıklamada 10 satır daha açar (veri zaten elde, istek yok).
 * Kutu 10 satır + alt satır yüksekliğini her durumda (yükleniyor / az maç / boş) korur → CLS 0.
 */
export default function RecentMatches({ matches, loading, error, pageSize = RECENT_PAGE_SIZE, seasonOf, currentSeason }: Props) {
  const { t } = useTranslation('team');
  const { t: tl } = useTranslation('leagues');
  const { t: tm } = useTranslation('match');
  const items = useMemo(() => buildRecentItems(matches, seasonOf, currentSeason), [matches, seasonOf, currentSeason]);
  // Ek sayfa (kullanıcı tıklaması) sayısı; ilk sayfa ayraç yüksekliğine göre 10 satır bütçesini aşmaz.
  const [extraPages, setExtraPages] = useState(0);
  const visible = initialRecentCount(items, pageSize) + extraPages * pageSize;

  if (loading) {
    return (
      <div className={styles.recentList} aria-busy="true">
        {Array.from({ length: pageSize }, (_, i) => (
          <div key={i} className={`${styles.matchRow} ${styles.recentRow}`} aria-hidden="true">
            <SkeletonBlock className={styles.matchTime} width={34} height={12} />
            <SkeletonBlock className={styles.recentSkeletonBody} height={14} />
          </div>
        ))}
      </div>
    );
  }

  if (error && matches.length === 0) {
    return (
      <div className={styles.recentList}>
        <div className={styles.empty}>{t('recent.error')}</div>
      </div>
    );
  }

  const shownItems = visibleRecentItems(items, visible);
  const shownCount = shownItems.filter((it) => it.kind === 'match').length;
  const remaining = matches.length - shownCount;

  return (
    <div className={styles.recentList}>
      {shownItems.map((item) => {
        if (item.kind === 'divider') {
          const label = t('recent.seasonDivider', { season: formatSeasonLabel(item.season) });
          return (
            <div key={`season-${item.season}`} className={styles.recentSeasonDivider} role="separator" aria-label={label}>
              <span>{label}</span>
            </div>
          );
        }
        const match = item.match;
        const status = recentMatchStatus(match);
        const comp = match.competition;
        const compName = comp?.id ? leagueNameById(comp.id, comp.name, tl) : '';
        const compFull = comp?.id ? leagueNameById(comp.id, comp.name, tl, 'full') : '';
        return (
          <Link
            href={buildMatchHref(match)}
            key={match.id}
            className={`${styles.matchRow} ${styles.recentRow}`}
            title={fullMatchDate(match) || undefined}
          >
            {status.kind === 'special' ? (
              <span className={styles.matchTime} title={tm(`list.${status.full}`)}>
                {tm(`list.${status.key}`)}
              </span>
            ) : (
              <span className={`${styles.matchTime} ${status.kind === 'live' ? styles.matchTimeLive : ''}`.trim()}>
                {status.text}
              </span>
            )}

            {/* Izgara hücreleri: tarih | ev | skor | deplasman | turnuva — kolon genişlikleri her satırda aynı. */}
            <span className={styles.matchTeam}>
              {match.home?.logo && (
                <TeamLogo src={match.home.logo} alt="" className={styles.matchTeamLogo} width={18} height={18} />
              )}
              <span className={styles.matchTeamName}>{match.home?.name || ''}</span>
            </span>
            <span className={styles.matchScore}>{match.scores?.score || match.scores?.ft_score || '-'}</span>
            <span className={styles.matchTeam}>
              {match.away?.logo && (
                <TeamLogo src={match.away.logo} alt="" className={styles.matchTeamLogo} width={18} height={18} />
              )}
              <span className={styles.matchTeamName}>{match.away?.name || ''}</span>
            </span>

            {compName ? (
              <span className={styles.recentComp} role="img" aria-label={compFull} title={compFull}>
                {comp?.logo ? (
                  <TeamLogo
                    src={comp.logo}
                    alt=""
                    className={`${styles.fixtureCompLogo} ${competitionLogoNeedsBackdrop(comp.id) ? styles.logoBackdrop : ''}`.trim()}
                    width={14}
                    height={14}
                  />
                ) : null}
                <span className={styles.recentCompName} aria-hidden="true">
                  {compName}
                </span>
              </span>
            ) : (
              <span className={styles.recentComp} aria-hidden="true" />
            )}
          </Link>
        );
      })}
      {matches.length === 0 && <div className={styles.empty}>{t('recent.empty')}</div>}
      {remaining > 0 ? (
        <div className={styles.recentFooter}>
          <button
            type="button"
            className={styles.recentMoreBtn}
            onClick={() => setExtraPages((p) => p + 1)}
            aria-label={t('recent.moreAria', { count: Math.min(pageSize, remaining) })}
          >
            {t('recent.more')}
          </button>
        </div>
      ) : null}
    </div>
  );
}
