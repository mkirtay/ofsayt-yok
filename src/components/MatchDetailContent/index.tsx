import { useEffect, useMemo, useRef, useState } from 'react';
import Router from 'next/router';
import Link from 'next/link';
import { useTranslation } from '@/lib/i18n';
import MatchCard from '@/components/MatchCard';
import EventTimeline from '@/components/EventTimeline';
import Lineup from '@/components/Lineup';
import type { Head2HeadData } from '@/services/liveScoreService';
import type { AnalysisPreview } from '@/utils/analysisPreview';
import MatchStats from '@/components/MatchStats';
import MatchTabs, { type MatchTabItem } from '@/components/MatchTabs';
import MatchTrivia from '@/components/MatchTrivia';
import MatchAnalysis from '@/components/MatchAnalysis';
import MatchForumTab from '@/components/MatchForumTab';
import type { MatchDetailState } from '@/hooks/useMatchDetail';
import { useMatchAnalysis } from '@/hooks/useMatchAnalysis';
import { matchDisplayState } from '@/utils/matchDisplayState';
import { applyTabDeepLink } from './tabDeepLink';
import { trackFrikik } from '@/lib/frikik/analytics';
import styles from './matchDetailContent.module.scss';

type Props = {
  detail: MatchDetailState;
  /** URL'den gelen maç id'si — `detail.matchId` çözülene kadar bunu kullanır */
  requestedMatchId: string;
  /** `panel`: split-view; istatistik/olaylar her zaman alt alta */
  variant?: 'page' | 'panel';
  /** SSR'da çözülmüş maç kartı formu + karşılaşma geçmişi (yalnız sayfa); bkz. MatchCard `initialH2h`. */
  initialH2h?: Head2HeadData | null;
  /** SSR'da hazırlanan AI analizi ücretsiz önizlemesi (yalnız sayfa) — AI sekmesi ilk HTML'de gizli çizilir. */
  initialAnalysisPreview?: AnalysisPreview | null;
};

/** Maç detayının DÜZ sekmeleri — sıra = görünüm sırası, alt sekme yok. */
export type MatchTabKey = 'overview' | 'forum' | 'analysis' | 'trivia';

export const MATCH_TAB_KEYS: readonly MatchTabKey[] = ['overview', 'forum', 'analysis', 'trivia'];

const PRERENDER_ANALYSIS: readonly MatchTabKey[] = ['analysis'];

/** Varsayılan sekme: Genel Bakış (veri hazır, AI kredisi harcamaz). */
export const DEFAULT_MATCH_TAB: MatchTabKey = 'overview';

export { tabFromSearch } from './tabDeepLink';

/**
 * Maç detayının ANA içeriği — sayfa ve split-view paneli AYNI IA: kart + dört eşit sekme
 * (Genel Bakış | Forum | AI Analiz | Trivia). "Genel Bakış" = Maç İstatistikleri → Maç Olayları → İlk 11.
 * `/matches/[slug]` sayfası ile split-view paneli aynı bileşeni kullanır; yükleme
 * durumlarında alt bileşenler kendi iskeletlerini (skeleton) gösterir.
 */
export default function MatchDetailContent({ detail, requestedMatchId, variant = 'page', initialH2h, initialAnalysisPreview = null }: Props) {
  const { t } = useTranslation('match');
  const { match, matchLoading, statsLoading, eventsLoading, lineupsLoading } = detail;
  const effectiveMatchId = detail.matchId || requestedMatchId;
  const [active, setActive] = useState<MatchTabKey>(DEFAULT_MATCH_TAB);
  const contentRef = useRef<HTMLDivElement>(null);
  // Derin bağlantı (`?sekme=ai-analiz`, yalnız sayfa varyantı): açılışta, sayfa içi geçişte ve geri/ileride sekmeyi
  // seçer + şeride kaydırır. Mount sonrası çalışır (SSR/CDN HTML'i sorgudan bağımsız). YALNIZ sekme açar — üretim /
  // kredi harcama buradan tetiklenemez (bkz. tabDeepLink.ts).
  useEffect(() => {
    if (variant !== 'page') return;
    const scrollToTabs = () =>
      window.requestAnimationFrame(() => {
        const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        contentRef.current?.querySelector('[role="tablist"]')?.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' });
      });
    const apply = (url: string) => applyTabDeepLink(url, { selectTab: setActive, scrollToTabs });
    apply(window.location.search);
    Router.events.on('routeChangeComplete', apply);
    return () => Router.events.off('routeChangeComplete', apply);
  }, [variant]);
  // AI analiz/kredi durumu sayfa açılışında çekilir — sekmeye girince beklemeden hazır olsun.
  const analysisState = useMatchAnalysis(effectiveMatchId, initialAnalysisPreview);

  const tabs = useMemo<MatchTabItem<MatchTabKey>[]>(
    () => [
      {
        key: 'overview',
        label: t('tabs.overview'),
        render: () => (
          <>
            <div
              className={[
                styles.statsEventsRow,
                variant === 'panel' ? styles.stacked : '',
                match && matchDisplayState(match).phase === 'PRE' ? styles.preMatch : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <div className={styles.col}>
                <MatchStats stats={detail.stats} loading={matchLoading || statsLoading} match={match} />
              </div>
              <div className={styles.col}>
                <EventTimeline
                  events={detail.events}
                  homeName={match?.home?.name}
                  awayName={match?.away?.name}
                  loading={matchLoading || eventsLoading}
                  match={match}
                />
              </div>
            </div>
            <Lineup lineups={detail.lineups} loading={matchLoading || lineupsLoading} match={match} />
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
          effectiveMatchId ? <MatchAnalysis key={effectiveMatchId} match={match} state={analysisState} /> : null,
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
      analysisState,
    ],
  );

  return (
    <div ref={contentRef} className={`${styles.content} ${variant === 'panel' ? styles.contentPanel : ''}`.trim()}>
      <MatchCard match={match} loading={matchLoading} initialH2h={initialH2h} />
      {variant === 'page' && match && matchDisplayState(match).phase === 'POST' ? (
        // Bitmiş maç: sakin, bağlamsal "Sen de at" bağlantısı (yalnız sayfa; panelde yok).
        <p className={styles.frikikCta}>
          <Link href="/frikik?src=match_cta" onClick={() => trackFrikik('frikik_card_click', { entry: 'match_cta' })}>
            ⚽ {t('frikikCta.label')}
          </Link>
          <span>{t('frikikCta.hint')}</span>
        </p>
      ) : null}
      <MatchTabs
        tabs={tabs}
        active={active}
        onChange={setActive}
        ariaLabel={t('tabs.label')}
        prerender={initialAnalysisPreview ? PRERENDER_ANALYSIS : undefined}
      />
    </div>
  );
}
