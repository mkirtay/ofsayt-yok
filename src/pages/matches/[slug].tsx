import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useCallback, useMemo } from 'react';
import Container from '@/components/Container';
import MatchDetailContent from '@/components/MatchDetailContent';
import { toStandingsCompetitionId } from '@/services/sportmonksProviderFlag';
import MatchCompetitionStandings from '@/components/MatchCompetitionStandings';
import MatchArchivedTabs from '@/components/MatchArchivedTabs';
import JsonLd from '@/components/JsonLd';
import { useMatchDetail } from '@/hooks/useMatchDetail';
import type { Match } from '@/models/liveScore';
import { buildMatchHref, buildMatchSlug, parseMatchIdFromParam, parseMatchSlugFromParam } from '@/utils/matchUrl';
import { matchOgImagePath } from '@/utils/matchOgImage';
import { useTranslation } from '@/lib/i18n';
import { leagueNameById } from '@/utils/leagueName';
import { resolveMatchPage } from '@/server/resolveMatchPage';
import { loadAnalysisPreviewForPage } from '@/server/analysisPreviewForPage';
import type { AnalysisPreview } from '@/utils/analysisPreview';
import { analysisPaywallJsonLd } from '@/utils/analysisPaywall';
import { defaultMatchPageOptionalDeps, loadMatchPageOptionalSections } from '@/server/matchPageOptional';
import { SPORTMONKS_TIMEOUT_MS, withSportmonksTimeout } from '@/server/sportmonks/cachedFetch';
import type { Head2HeadData } from '@/services/liveScoreService';
import type { MatchEvent, MatchLineupData, MatchStatsData } from '@/models/domain';
import {
  LIGHT_BOT_PAGE_CACHE,
  matchPageCacheControl,
  matchPageCacheControlForPage,
  matchPageCacheKindForStatus,
  TRANSIENT_ERROR_RETRY_AFTER_SECONDS,
  type MatchPageCacheKind,
} from '@/server/matchPageCache';
import { isLightPageBot } from '@/config/crawlers';
import styles from './matchDetail.module.scss';
import { siteBaseUrl } from '@/lib/siteUrl';
import { brandTitle } from '@/config/brand';

type MatchDetailProps = {
  initialMatch: Match | null;
  /**
   * Maç kartı formu + karşılaşma geçmişi (SSR, 400 ms bütçe): null = veri yok; alan yoksa bütçe aşıldı → istemci
   * çeker. Kart sonradan uzamasın diye (CLS).
   */
  initialH2h?: Head2HeadData | null;
  /**
   * Genel Bakış verisi (SSR): olaylar maçı çözen istekte gelir; istatistik 400 ms bütçeyle; kadro yalnız "yok" (null)
   * ise. Alan yoksa istemci çeker. Kartlar ilk boyamada gerçek boyunda → altlarındaki kadro kutusu sonradan
   * itilmez (CLS).
   */
  initialEvents?: MatchEvent[];
  initialStats?: MatchStatsData | null;
  initialLineups?: MatchLineupData | null;
  /** Ölü eski URL (ya da aynı id'li başka maçın slug'ı) → 410; istemci hiç veri çekmez. */
  gone?: boolean;
  /** Sağlayıcıda yok, DB'de saklı içerik var → doğrudan arşiv görünümü; istemci sağlayıcıya gitmez. */
  archived?: boolean;
  /** AI analizi ücretsiz önizlemesi (kredi modeli v2; analiz yoksa alan yok) — SEO için HTML'de. */
  initialAnalysisPreview?: AnalysisPreview;
};

/**
 * Twitter/Facebook gibi sosyal paylaşım botları sayfayı JS çalıştırmadan
 * kırpar — bu yüzden maç verisini SSR'da da çekiyoruz. Böylece paylaşım
 * kartında jenerik "Maç Detayı" yerine gerçek takım isimleri/skor görünür
 * ve kullanıcı ilk açılışta da boş bir sayfa görmez.
 */
function decodeSafe(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

export const getServerSideProps: GetServerSideProps<MatchDetailProps> = async (context) => {
  const slugParam = context.params?.slug;
  const slug = Array.isArray(slugParam) ? slugParam[0] : slugParam;
  const matchId = slug ? parseMatchIdFromParam(slug) : '';

  const setCache = (kind: MatchPageCacheKind) =>
    context.res.setHeader('Cache-Control', matchPageCacheControl(kind));

  if (!matchId) {
    // Id'siz / bozuk URL (bot taramaları): her istekte SSR olmasın.
    setCache('missing');
    return { props: { initialMatch: null } };
  }

  // Sportmonks bütçesi sayfa render'ı için kısa (zaman aşımı → 'error' → istemci çeker; bkz. cachedFetch).
  const withPageTimeout = <T,>(fn: () => Promise<T>) => withSportmonksTimeout(SPORTMONKS_TIMEOUT_MS.page, fn);
  // AI / kazıyıcı bot (bkz. config/crawlers.ts): maç + olaylar + meta tam, H2H/form/istatistik/kadro sunucuda çekilmez.
  const lightBot = isLightPageBot(context.req?.headers?.['user-agent']);
  // Geçici hata: HTML isteğine 503 (bkz. TRANSIENT_ERROR_RETRY_AFTER_SECONDS); istemci gezinmesinin veri isteği
  // (`x-nextjs-data`) 200 kalır — Next 5xx veri yanıtında sayfayı baştan yükler.
  const transientError = () => {
    if (context.req?.headers?.['x-nextjs-data']) return { props: { initialMatch: null } };
    context.res.statusCode = 503;
    context.res.setHeader('Retry-After', String(TRANSIENT_ERROR_RETRY_AFTER_SECONDS));
    context.res.setHeader('Cache-Control', 'no-store');
    return { props: { initialMatch: null } };
  };
  try {
    const page = await withPageTimeout(() => resolveMatchPage(matchId, parseMatchSlugFromParam(slug ?? '')));
    switch (page.kind) {
      case 'match': {
        // Slug kanonik değilse (yalnız id, eski slug kuralı "s-o-paulo-santos", ad değişikliği) sunucuda 301; sorgu korunur.
        // Site slug üretemiyorsa (takım adı yok) yönlendirme yok.
        const canonical = buildMatchHref(page.match);
        const requested = `/matches/${decodeSafe(slug ?? '')}`;
        if (buildMatchSlug(page.match) && requested !== canonical) {
          setCache(matchPageCacheKindForStatus(page.match.status));
          const resolved = context.resolvedUrl ?? '';
          const qIdx = resolved.indexOf('?');
          return { redirect: { destination: qIdx >= 0 ? canonical + resolved.slice(qIdx) : canonical, statusCode: 301 } };
        }
        const apiMatchId = String(page.match.id);
        // H2H/form + istatistik/kadro: Fixture havuzu baskı altındaysa sunucuda atlanır, istemci çeker (bkz. matchPageOptional).
        // İstatistik/kadro maçı çözen aynı `fixtures/{id}` yanıtında geldiyse (normal yol) ek istek yok ve baskıda da verilir;
        // hafif bot sürümünde yok.
        const pageSeed = page.stats !== undefined && page.lineups !== undefined ? { stats: page.stats, lineups: page.lineups } : null;
        const [optional, analysisPreview] = await Promise.all([
          loadMatchPageOptionalSections(page.match, apiMatchId, {
            ...defaultMatchPageOptionalDeps,
            loadH2h: (m) => withPageTimeout(() => defaultMatchPageOptionalDeps.loadH2h(m)),
            // Çekirdek veri hafif yedekten geldiyse (birleşik istek geçici hata) tohum yeniden denenmez: istemci çeker, sayfa
            // CDN'de geçici hata süresi kadar (≤ 60 sn) tutulur.
            loadSeed: (id) =>
              page.partial
                ? Promise.resolve({ stats: undefined, lineups: undefined, failed: true })
                : pageSeed
                  ? Promise.resolve(pageSeed)
                  : withPageTimeout(() => defaultMatchPageOptionalDeps.loadSeed(id)),
            ...(lightBot ? { underPressure: async () => true } : {}),
          }),
          // Kredi modeli v2: AI analizi ücretsiz önizlemesi (tek DB sorgusu; hata → null, sayfa yine çizilir).
          loadAnalysisPreviewForPage(apiMatchId),
        ]);
        const { h2h } = optional;
        const transientError = optional.transientError || page.partial === true;
        const seed = optional.skipped && !lightBot && pageSeed ? pageSeed : optional.seed;
        const complete = h2h !== undefined && seed.stats !== undefined && seed.lineups !== undefined;
        // Bütçe aşıldıysa (undefined) bölüm iskeletle gider → CDN bu kopyayı ≤1 sa tutar; geçici hatada ≤60 sn; bot kopyası
        // hiç saklanmaz.
        context.res.setHeader(
          'Cache-Control',
          lightBot ? LIGHT_BOT_PAGE_CACHE : matchPageCacheControlForPage(page.match, complete, Date.now(), transientError),
        );
        return {
          props: {
            initialMatch: page.match,
            initialEvents: page.events,
            ...(h2h !== undefined ? { initialH2h: h2h } : {}),
            ...(seed.stats !== undefined ? { initialStats: seed.stats } : {}),
            // Kadro yalnız "yok" ise taşınır (boş durum baştan çizilir, kutu sonradan çökmez). Varsa istemci çeker:
            // Genel Bakış'ın en altında, büyümesi yalnız ekran dışındaki footer'ı iter; kadro HTML'i (~90 KB, gzip ~5,5 KB; büyük
            // DOM) mobilde FCP/LCP'yi ~130/370 ms geciktiriyordu.
            ...(seed.lineups === null ? { initialLineups: null } : {}),
            ...(analysisPreview ? { initialAnalysisPreview: analysisPreview } : {}),
          },
        };
      }
      case 'archived':
        setCache('archived');
        return { props: { initialMatch: null, archived: true } };
      case 'gone':
        context.res.statusCode = 410;
        setCache('gone');
        return { props: { initialMatch: null, gone: true } };
      case 'missing':
        setCache('missing');
        return { props: { initialMatch: null } };
      default:
        return transientError();
    }
  } catch {
    return transientError();
  }
};

export default function MatchDetail({
  initialMatch,
  initialH2h,
  initialEvents,
  initialStats,
  initialLineups,
  gone = false,
  archived = false,
  initialAnalysisPreview,
}: MatchDetailProps) {
  const router = useRouter();
  const slugParam = router.query.slug;
  const slugFromPath = router.asPath.match(/^\/matches\/([^/?#]+)/)?.[1] ?? '';
  const slug =
    typeof slugParam === 'string'
      ? slugParam
      : Array.isArray(slugParam)
        ? slugParam[0] ?? slugFromPath
        : slugFromPath;
  const routeMatchId = slug ? parseMatchIdFromParam(slug) : '';
  // 410 ve SSR'ın arşiv dediği sayfada istemci sağlayıcıya hiç gitmez (aynı id'li başka maç gelmesin).
  const requestedMatchId = gone || archived ? '' : routeMatchId;

  const initialDetail = useMemo(
    () => ({ events: initialEvents, stats: initialStats, lineups: initialLineups }),
    [initialEvents, initialStats, initialLineups],
  );
  const detail = useMatchDetail(requestedMatchId, {
    initialMatch,
    initialDetail,
    // Slug canonical değilse (yalnızca id / eski slug) adres çubuğunu düzelt
    onMatchFound: useCallback(
      (found: Match) => {
        const canonical = buildMatchHref(found);
        if (slug && router.asPath !== canonical) {
          void router.replace(canonical, undefined, { shallow: true });
        }
      },
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [slug],
    ),
  });
  const {
    matchId,
    match,
    standings,
    seasons,
    selectedSeasonId,
    matchLoading,
    standingsLoading,
    standingsError,
    retryStandings,
    notFound,
    isArchivedMatch,
    handleSeasonChange,
  } = detail;

  const canonicalPath = useMemo(() => {
    if (match) return buildMatchHref(match);
    if (routeMatchId) return `/matches/${slug || routeMatchId}`;
    return '/matches';
  }, [match, routeMatchId, slug]);

  const { t: tl } = useTranslation('leagues');
  const compId = match?.competition?.id ?? match?.competition_id;
  const standingsCompId = toStandingsCompetitionId(compId);

  const showArchived =
    archived || (router.isReady && Boolean(requestedMatchId) && isArchivedMatch && !match);
  const showNotFound =
    router.isReady && Boolean(requestedMatchId) && notFound && !showArchived;
  const showLayout = !showNotFound && !showArchived;

  const homeName = match?.home?.name || '';
  const awayName = match?.away?.name || '';
  const pageTitle =
    homeName && awayName ? brandTitle(`${homeName} - ${awayName}`) : brandTitle('Maç Detayı');
  const compName = match?.competition?.name || match?.competition_name || '';
  const pageDescription =
    homeName && awayName
      ? `${homeName} vs ${awayName}${compName ? ` - ${compName}` : ''} maç detayı, istatistikler ve kadro bilgileri.`
      : 'Maç detayı, istatistikler ve kadro bilgileri.';
  // Paylaşım metni (og / twitter): maçın resmî hashtag'i varsa sonuna (Sportmonks metadata, ör. "#GALKAS").
  const shareDescription = match?.hashtag ? `${pageDescription} ${match.hashtag}` : pageDescription;
  const canonicalUrl = `${siteBaseUrl()}${canonicalPath}`;
  // Kimlik tabanlı paylaşım görseli: içerik sunucudaki maç verisinden, `v` yalnız önbellek anahtarı (bkz. utils/matchOgImage.ts).
  const ogImageUrl = match && homeName && awayName
    ? `${siteBaseUrl()}${matchOgImagePath(match)}`
    : null;
  const effectiveMatchId = matchId || requestedMatchId || (archived ? routeMatchId : '');
  const homeTeamId = match?.home?.id ?? match?.home_id;
  const awayTeamId = match?.away?.id ?? match?.away_id;
  const showStandingsBlock = compId != null || matchLoading;

  if (gone) {
    return (
      <Container>
        <Head>
          <title>{brandTitle('Maç bulunamadı')}</title>
          <meta name="robots" content="noindex" />
        </Head>
        <div className={styles.notFound}>Bu maç artık mevcut değil.</div>
      </Container>
    );
  }

  if (showNotFound) {
    return (
      <Container>
        <div className={styles.notFound}>Maç bulunamadı.</div>
      </Container>
    );
  }

  if (showArchived) {
    return (
      <>
        <Head>
          <title>{pageTitle}</title>
          <meta name="description" content={pageDescription} />
          <link rel="canonical" href={canonicalUrl} />
        </Head>
        <Container>
          <div className={styles.archivedNotice}>
            Bu maç artık canlı veri sağlayıcısında bulunmuyor. Aşağıda bu maç için
            daha önce üretilmiş/saklanmış içerikler (varsa) gösteriliyor.
          </div>
          {effectiveMatchId ? <MatchArchivedTabs matchId={effectiveMatchId} /> : null}
        </Container>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>{pageTitle}</title>
        <meta name="description" content={pageDescription} />
        <link rel="canonical" href={canonicalUrl} />
        <meta property="og:title" content={pageTitle} />
        <meta property="og:description" content={shareDescription} />
        <meta property="og:type" content="article" key="og:type" />
        <meta property="og:url" content={canonicalUrl} />
        {ogImageUrl && (
          <>
            <meta property="og:image" content={ogImageUrl} key="og:image" />
            <meta property="og:image:width" content="1200" key="og:image:width" />
            <meta property="og:image:height" content="630" key="og:image:height" />
            <meta property="og:image:alt" content={`${homeName} – ${awayName}${compName ? ` · ${compName}` : ''}`} key="og:image:alt" />
            <meta name="twitter:image" content={ogImageUrl} key="twitter:image" />
            <meta name="twitter:image:alt" content={`${homeName} – ${awayName}${compName ? ` · ${compName}` : ''}`} key="twitter:image:alt" />
            <meta name="twitter:card" content="summary_large_image" key="twitter:card" />
          </>
        )}
        <meta name="twitter:title" content={pageTitle} />
        <meta name="twitter:description" content={shareDescription} />
        {match ? (
          <JsonLd
            schema={{
              '@context': 'https://schema.org',
              '@type': 'SportsEvent',
              name: pageTitle,
              url: canonicalUrl,
              sport: 'Soccer',
              ...(match.date ? { startDate: match.date } : {}),
              homeTeam: homeName ? { '@type': 'SportsTeam', name: homeName } : undefined,
              awayTeam: awayName ? { '@type': 'SportsTeam', name: awayName } : undefined,
              ...(compName ? { organizer: { '@type': 'Organization', name: compName } } : {}),
            }}
          />
        ) : null}
        {initialAnalysisPreview && match && match.status !== 'FINISHED' ? (
          // Kredi modeli v2: AI analizinin tamamı kilitli → Google'ın ücretli içerik işaretlemesi. Kilitli bölüm HTML'de
          // yalnız başlıklarla (`.ai-analysis-locked`); Googlebot kullanıcıyla aynı içeriği görür (cloaking değil).
          <JsonLd
            schema={analysisPaywallJsonLd({
              homeTeamName: initialAnalysisPreview.homeTeamName,
              awayTeamName: initialAnalysisPreview.awayTeamName,
              url: canonicalUrl,
            })}
          />
        ) : null}
      </Head>
      <Container>
        {showLayout ? (
          <div className="layout-split">
            <div className="layout-left">
              <MatchDetailContent
                key={requestedMatchId}
                detail={detail}
                requestedMatchId={requestedMatchId}
                initialH2h={initialH2h}
                initialAnalysisPreview={initialAnalysisPreview ?? null}
              />
            </div>
            <div className="layout-right">
              {showStandingsBlock ? (
                <MatchCompetitionStandings
                  data={standings}
                  loading={standingsLoading || matchLoading}
                  error={standingsError}
                  onRetry={retryStandings}
                  competitionName={leagueNameById(compId, match?.competition?.name ?? match?.competition_name, tl, 'full')}
                  homeTeamId={homeTeamId}
                  awayTeamId={awayTeamId}
                  seasons={seasons}
                  selectedSeasonId={selectedSeasonId}
                  onSeasonChange={
                    standingsCompId != null ? (sid) => handleSeasonChange(sid, String(standingsCompId)) : undefined
                  }
                />
              ) : null}
            </div>
          </div>
        ) : null}
      </Container>
    </>
  );
}
