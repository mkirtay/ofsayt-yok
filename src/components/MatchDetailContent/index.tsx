import { useState } from 'react';
import MatchCard from '@/components/MatchCard';
import EventTimeline from '@/components/EventTimeline';
import Lineup from '@/components/Lineup';
import MatchStats from '@/components/MatchStats';
import MatchInsightTabs from '@/components/MatchInsightTabs';
import type { MatchDetailState } from '@/hooks/useMatchDetail';
import styles from './matchDetailContent.module.scss';

type Props = {
  detail: MatchDetailState;
  /** URL'den gelen maç id'si — `detail.matchId` çözülene kadar bunu kullanır */
  requestedMatchId: string;
  /** `panel`: split-view; istatistik/olaylar her zaman alt alta */
  variant?: 'page' | 'panel';
};

/**
 * Maç detayının ANA içeriği — sayfa ve split-view paneli AYNI IA: kart + chip'ler;
 * "Genel Bakış" (Maç İstatistikleri → Maç Olayları → İlk 11) | "AI Analiz & Topluluk" (MatchInsightTabs, değişmeden).
 * `/matches/[slug]` sayfası ile split-view paneli aynı bileşeni kullanır; yükleme
 * durumlarında alt bileşenler kendi iskeletlerini (skeleton) gösterir.
 */
type PageTab = 'overview' | 'insight';

export default function MatchDetailContent({ detail, requestedMatchId, variant = 'page' }: Props) {
  const { match, matchLoading, statsLoading, eventsLoading, lineupsLoading } = detail;
  const effectiveMatchId = detail.matchId || requestedMatchId;
  const [pageTab, setPageTab] = useState<PageTab>('overview');
  // AI sekmesi ilk açılışta mount edilir (gereksiz analiz/trivia isteği yok), sonra iç durumu korunması için gizlenir.
  const [insightVisited, setInsightVisited] = useState(false);

  const statsEvents = (
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
  );
  const insight = effectiveMatchId ? <MatchInsightTabs key={effectiveMatchId} matchId={effectiveMatchId} match={match} /> : null;
  const lineup = <Lineup lineups={detail.lineups} loading={matchLoading || lineupsLoading} />;

  const select = (tab: PageTab) => {
    setPageTab(tab);
    if (tab === 'insight') setInsightVisited(true);
  };
  const tabs: Array<{ id: PageTab; label: string }> = [
    { id: 'overview', label: 'Genel Bakış' },
    { id: 'insight', label: 'AI Analiz & Topluluk' },
  ];

  return (
    <div className={`${styles.content} ${variant === 'panel' ? styles.contentPanel : ''}`.trim()}>
      <MatchCard match={match} loading={matchLoading} />
      <div className={styles.chips} role="tablist" aria-label="Maç detay bölümleri">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`match-tab-${t.id}`}
            aria-selected={pageTab === t.id}
            aria-controls={`match-panel-${t.id}`}
            className={`${styles.chip} ${pageTab === t.id ? styles.chipActive : ''}`.trim()}
            onClick={() => select(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {/* Her iki sekme paneli AYNI sarmalayıcı sınıfla (üst boşluk = `.content` gap'i; ilk çocuğun kendi margin-top'ı sıfırlanır). */}
      <div role="tabpanel" id="match-panel-overview" aria-labelledby="match-tab-overview" hidden={pageTab !== 'overview'} className={styles.tabPanel}>
        {statsEvents}
        {lineup}
      </div>
      {insightVisited ? (
        <div role="tabpanel" id="match-panel-insight" aria-labelledby="match-tab-insight" hidden={pageTab !== 'insight'} className={styles.tabPanel}>
          {insight}
        </div>
      ) : null}
    </div>
  );
}
