import { useMemo, useState } from 'react';
import { useTranslation } from '@/lib/i18n';
import MatchCard from '@/components/MatchCard';
import EventTimeline from '@/components/EventTimeline';
import Lineup from '@/components/Lineup';
import MatchStats from '@/components/MatchStats';
import MatchTabs, { type MatchTabItem } from '@/components/MatchTabs';
import MatchTrivia from '@/components/MatchTrivia';
import MatchAnalysis from '@/components/MatchAnalysis';
import MatchForumTab from '@/components/MatchForumTab';
import type { MatchDetailState } from '@/hooks/useMatchDetail';
import styles from './matchDetailContent.module.scss';

type Props = {
  detail: MatchDetailState;
  /** URL'den gelen maç id'si — `detail.matchId` çözülene kadar bunu kullanır */
  requestedMatchId: string;
  /** `panel`: split-view; istatistik/olaylar her zaman alt alta */
  variant?: 'page' | 'panel';
};

/** Maç detayının DÜZ sekmeleri — sıra = görünüm sırası, alt sekme yok. */
export type MatchTabKey = 'overview' | 'forum' | 'analysis' | 'trivia';

export const MATCH_TAB_KEYS: readonly MatchTabKey[] = ['overview', 'forum', 'analysis', 'trivia'];

/** Varsayılan sekme: Genel Bakış (veri hazır, AI kredisi harcamaz). */
export const DEFAULT_MATCH_TAB: MatchTabKey = 'overview';

/**
 * Maç detayının ANA içeriği — sayfa ve split-view paneli AYNI IA: kart + dört eşit sekme
 * (Genel Bakış | Forum | AI Analiz | Trivia). "Genel Bakış" = Maç İstatistikleri → Maç Olayları → İlk 11.
 * `/matches/[slug]` sayfası ile split-view paneli aynı bileşeni kullanır; yükleme
 * durumlarında alt bileşenler kendi iskeletlerini (skeleton) gösterir.
 */
export default function MatchDetailContent({ detail, requestedMatchId, variant = 'page' }: Props) {
  const { t } = useTranslation('match');
  const { match, matchLoading, statsLoading, eventsLoading, lineupsLoading } = detail;
  const effectiveMatchId = detail.matchId || requestedMatchId;
  const [active, setActive] = useState<MatchTabKey>(DEFAULT_MATCH_TAB);

  const tabs = useMemo<MatchTabItem<MatchTabKey>[]>(
    () => [
      {
        key: 'overview',
        label: t('tabs.overview'),
        render: () => (
          <>
            <div className={`${styles.statsEventsRow} ${variant === 'panel' ? styles.stacked : ''}`.trim()}>
              <div className={styles.col}>
                <MatchStats stats={detail.stats} loading={matchLoading || statsLoading} />
              </div>
              <div className={styles.col}>
                <EventTimeline
                  events={detail.events}
                  homeName={match?.home?.name}
                  awayName={match?.away?.name}
                  loading={matchLoading || eventsLoading}
                />
              </div>
            </div>
            <Lineup lineups={detail.lineups} loading={matchLoading || lineupsLoading} />
          </>
        ),
      },
      {
        key: 'forum',
        label: t('tabs.forum'),
        render: () => (effectiveMatchId ? <MatchForumTab key={effectiveMatchId} matchId={effectiveMatchId} /> : null),
      },
      {
        key: 'analysis',
        label: t('tabs.analysis'),
        premium: true,
        render: () =>
          effectiveMatchId ? <MatchAnalysis key={effectiveMatchId} matchId={effectiveMatchId} match={match} /> : null,
      },
      {
        key: 'trivia',
        label: t('tabs.trivia'),
        premium: true,
        render: () =>
          effectiveMatchId ? <MatchTrivia key={effectiveMatchId} matchId={effectiveMatchId} match={match} /> : null,
      },
    ],
    [
      t,
      variant,
      detail.stats,
      detail.events,
      detail.lineups,
      match,
      matchLoading,
      statsLoading,
      eventsLoading,
      lineupsLoading,
      effectiveMatchId,
    ],
  );

  return (
    <div className={`${styles.content} ${variant === 'panel' ? styles.contentPanel : ''}`.trim()}>
      <MatchCard match={match} loading={matchLoading} />
      <MatchTabs tabs={tabs} active={active} onChange={setActive} ariaLabel={t('tabs.label')} />
    </div>
  );
}
