import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useCallback, useEffect, useMemo } from 'react';
import Container from '@/components/Container';
import MatchDetailContent from '@/components/MatchDetailContent';
import { toStandingsCompetitionId } from '@/services/sportmonksProviderFlag';
import MatchCompetitionStandings from '@/components/MatchCompetitionStandings';
import MatchInsightTabs from '@/components/MatchInsightTabs';
import JsonLd from '@/components/JsonLd';
import { useMatchDetail } from '@/hooks/useMatchDetail';
import type { Match } from '@/models/liveScore';
import { buildMatchHref, parseMatchIdFromParam } from '@/utils/matchUrl';
import { WORLD_CUP_COMPETITION_ID } from '@/config/worldCup';
import { resolveLiveMatch } from '@/lib/resolveLiveMatch';
import { livescoreServerClient } from '@/server/livescoreInternalAxios';
import { runWithLiveScoreHttpClient } from '@/services/liveScoreHttpContext';
import styles from './matchDetail.module.scss';

type MatchDetailProps = {
  initialMatch: Match | null;
};

/**
 * Twitter/Facebook gibi sosyal paylaşım botları sayfayı JS çalıştırmadan
 * kırpar — bu yüzden maç verisini SSR'da da çekiyoruz. Böylece paylaşım
 * kartında jenerik "Maç Detayı" yerine gerçek takım isimleri/skor görünür
 * ve kullanıcı ilk açılışta da boş bir sayfa görmez.
 */
export const getServerSideProps: GetServerSideProps<MatchDetailProps> = async (context) => {
  const slugParam = context.params?.slug;
  const slug = Array.isArray(slugParam) ? slugParam[0] : slugParam;
  const matchId = slug ? parseMatchIdFromParam(slug) : '';

  if (!matchId) {
    return { props: { initialMatch: null } };
  }

  try {
    const client = livescoreServerClient();
    const initialMatch = await runWithLiveScoreHttpClient(client, async () => {
      const resolved = await resolveLiveMatch(matchId);
      return resolved?.match ?? null;
    });
    return { props: { initialMatch: initialMatch ?? null } };
  } catch {
    // SSR sırasında bir hata olursa client-side fetch zaten devreye girecek —
    // sayfayı 500'letmek yerine boş prop ile devam ediyoruz.
    return { props: { initialMatch: null } };
  }
};

export default function MatchDetail({ initialMatch }: MatchDetailProps) {
  const router = useRouter();
  const slugParam = router.query.slug;
  const slugFromPath = router.asPath.match(/^\/matches\/([^/?#]+)/)?.[1] ?? '';
  const slug =
    typeof slugParam === 'string'
      ? slugParam
      : Array.isArray(slugParam)
        ? slugParam[0] ?? slugFromPath
        : slugFromPath;
  const requestedMatchId = slug ? parseMatchIdFromParam(slug) : '';

  const detail = useMatchDetail(requestedMatchId, {
    initialMatch,
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
    notFound,
    isArchivedMatch,
    handleSeasonChange,
  } = detail;

  const canonicalPath = useMemo(() => {
    if (match) return buildMatchHref(match);
    if (requestedMatchId) return `/matches/${slug || requestedMatchId}`;
    return '/matches';
  }, [match, requestedMatchId, slug]);

  const compId = match?.competition?.id ?? match?.competition_id;
  const isWorldCup = compId === WORLD_CUP_COMPETITION_ID;
  const standingsCompId = toStandingsCompetitionId(compId);

  useEffect(() => {
    document.body.classList.toggle('worldCupHeaderOnly', isWorldCup);
    return () => {
      document.body.classList.remove('worldCupHeaderOnly');
    };
  }, [isWorldCup]);

  const showArchived =
    router.isReady && Boolean(requestedMatchId) && isArchivedMatch && !match;
  const showNotFound =
    router.isReady && Boolean(requestedMatchId) && notFound && !showArchived;
  const showLayout = !showNotFound && !showArchived;

  const homeName = match?.home?.name || '';
  const awayName = match?.away?.name || '';
  const pageTitle =
    homeName && awayName ? `${homeName} - ${awayName} | Ofsayt Yok` : 'Maç Detayı | Ofsayt Yok';
  const compName = match?.competition?.name || match?.competition_name || '';
  const pageDescription =
    homeName && awayName
      ? `${homeName} vs ${awayName}${compName ? ` - ${compName}` : ''} maç detayı, istatistikler ve kadro bilgileri.`
      : 'Maç detayı, istatistikler ve kadro bilgileri.';
  const canonicalUrl = `${process.env.AUTH_URL ?? 'https://ofsaytyok.app'}${canonicalPath}`;
  const scoreLine = match?.scores?.score || match?.score || '';
  const ogImageUrl = homeName && awayName
    ? `${process.env.AUTH_URL ?? 'https://ofsaytyok.app'}/api/og/match?${new URLSearchParams({
        home: homeName,
        away: awayName,
        ...(match?.home?.logo ? { homeLogo: match.home.logo } : {}),
        ...(match?.away?.logo ? { awayLogo: match.away.logo } : {}),
        ...(scoreLine ? { score: String(scoreLine) } : {}),
        comp: compName || 'Maç Detayı',
      }).toString()}`
    : null;
  const effectiveMatchId = matchId || requestedMatchId;
  const homeTeamId = match?.home?.id ?? match?.home_id;
  const awayTeamId = match?.away?.id ?? match?.away_id;
  const showStandingsBlock = compId != null || matchLoading;

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
          {effectiveMatchId ? <MatchInsightTabs matchId={effectiveMatchId} match={null} /> : null}
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
        <meta property="og:description" content={pageDescription} />
        <meta property="og:type" content="article" key="og:type" />
        <meta property="og:url" content={canonicalUrl} />
        {ogImageUrl && (
          <>
            <meta property="og:image" content={ogImageUrl} key="og:image" />
            <meta property="og:image:width" content="1200" key="og:image:width" />
            <meta property="og:image:height" content="630" key="og:image:height" />
            <meta name="twitter:image" content={ogImageUrl} />
            <meta name="twitter:card" content="summary_large_image" key="twitter:card" />
          </>
        )}
        <meta name="twitter:title" content={pageTitle} />
        <meta name="twitter:description" content={pageDescription} />
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
      </Head>
      <Container>
        {showLayout ? (
          <div className="layout-split">
            <div className="layout-left">
              <MatchDetailContent key={requestedMatchId} detail={detail} requestedMatchId={requestedMatchId} />
            </div>
            <div className="layout-right">
              {showStandingsBlock ? (
                <MatchCompetitionStandings
                  data={standings}
                  loading={standingsLoading || matchLoading}
                  competitionName={match?.competition?.name ?? match?.competition_name}
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
