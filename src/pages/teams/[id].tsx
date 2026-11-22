import type { GetStaticPaths, GetStaticProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import Container from '@/components/Container';
import TeamDetailView from '@/components/TeamDetailView';
import { teamOgImagePath } from '@/utils/teamOgImage';
import { siteBaseUrl } from '@/lib/siteUrl';
import { BRAND, brandTitle } from '@/config/brand';
import { isNationalMatchId } from '@/services/apiFootball/ids';
import { nationalMatchesEnabled } from '@/config/nationalMatches';
import { breadcrumbJsonLd } from '@/utils/breadcrumbJsonLd';
import { parseTeamIdParam, teamHref, teamSlugParam } from '@/utils/teamUrl';
import JsonLd from '@/components/JsonLd';
import type { TeamPageFacts } from '@/server/teamPageShell';
import { buildTeamSummary, teamJsonLd, teamPageDescription, teamPageTitle } from '@/utils/teamSeo';
import styles from './teamPage.module.scss';
import { clampDescription } from '@/utils/seoText';
import TeamPassCard from '@/components/TeamPassCard';

const TEAM_PASS_ON = process.env.NEXT_PUBLIC_TEAM_PASS_ENABLED === 'true';

type TeamPageProps = {
  /** Paylaşım etiketleri için (sunucuda, ISR); geçici hatada null — sayfa yine istemcide yüklenir. */
  teamName: string | null;
  ogImagePath: string;
  /** SEO / GEO özeti (durağan bilgiler, kabukla aynı yanıttan); yoksa null. */
  facts?: TeamPageFacts | null;
};

const SITE_URL = siteBaseUrl();
const DAY_SECONDS = 86_400;
/**
 * Kabukta yalnız takım adı var (değişmez) → 7 gün. Görsel adresindeki `v` (gün) bu sürede eskir; görsel route'u eski
 * `v`'yi çizmeden güncel adrese 307 ile yönlendirir (bkz. api/og/team/[id].ts), görsel yine güncel.
 */
const SHELL_REVALIDATE_SECONDS = 7 * DAY_SECONDS;

/**
 * ISR kabuğu: yalnız paylaşım etiketleri (og / twitter) için takım adı sunucuda; sayfanın tüm verisi eskisi gibi
 * istemcide (TeamDetailView). Önceden sayfa üretilmez (`paths: []`), ilk ziyarette üretilip 7 gün önbellekte kalır (takım yoksa 404, 1 gün).
 */
export const getStaticPaths: GetStaticPaths = async () => ({ paths: [], fallback: 'blocking' });

export const getStaticProps: GetStaticProps<TeamPageProps> = async ({ params }) => {
  const param = String(params?.id ?? '');
  const id = parseTeamIdParam(param);
  if (!id) return { notFound: true, revalidate: DAY_SECONDS };
  // Kanonik adres `/teams/{id}-{ad}` (SEO): eski `/teams/{id}` ve yanlış ad → 301.
  const canonicalRedirect = (name: string | null | undefined) => {
    const canonical = teamSlugParam(id, name);
    return name && param !== canonical ? { redirect: { destination: teamHref(id, name), permanent: true }, revalidate: SHELL_REVALIDATE_SECONDS } : null;
  };
  // Milli takım (API-Football): ayrı kabuk; bayrak kapalıyken sayfa yok. Paylaşım görseli yok (OG ucu lig takımı verisine bağlı).
  if (isNationalMatchId(id)) {
    if (!nationalMatchesEnabled()) return { notFound: true, revalidate: 60 };
    const { loadNationalTeam } = await import('@/server/apiFootball/nationalTeam');
    const r = await loadNationalTeam(id);
    if (r.kind === 'missing') return { notFound: true, revalidate: DAY_SECONDS };
    const redirect = r.kind === 'found' ? canonicalRedirect(r.data.team.name) : null;
    if (redirect) return redirect;
    return { props: { teamName: r.kind === 'found' ? r.data.team.name : null, ogImagePath: '' }, revalidate: r.kind === 'found' ? 3600 : 60 };
  }
  const { loadTeamPageShell } = await import('@/server/teamPageShell');
  const shell = await loadTeamPageShell(id);
  if (shell.kind === 'missing') return { notFound: true, revalidate: DAY_SECONDS };
  const redirect = shell.kind === 'found' ? canonicalRedirect(shell.name) : null;
  if (redirect) return redirect;
  return {
    props: {
      teamName: shell.kind === 'found' ? shell.name : null,
      ogImagePath: teamOgImagePath(id),
      facts: shell.kind === 'found' ? shell.facts : null,
    },
    // Geçici hata: etiketsiz kabuk kısa süre kalsın.
    revalidate: shell.kind === 'found' ? SHELL_REVALIDATE_SECONDS : 60,
  };
};

/**
 * /teams/[id] — "Detaylı Görünüm". İçerik `TeamDetailView` ile ana sayfa split-view `TeamDetailPanel`
 * arasında paylaşılır (bu sayfa `variant="page"`).
 */
export default function TeamDetail({ teamName, ogImagePath, facts }: TeamPageProps) {
  const router = useRouter();
  const idParam = router.query.id;
  // Statik prerender/hydration sırasında `asPath` literal "/teams/[id]" olabiliyor → "[id]" takım id'si sanılıp
  // gerçek bir Sportmonks isteği (422) atılıyordu. Yer tutucuyu yok say.
  const rawIdFromPath = router.asPath.match(/^\/teams\/([^/?#]+)/)?.[1] ?? '';
  const idFromPath = /^\[.*\]$/.test(rawIdFromPath) ? '' : rawIdFromPath;
  const teamId = parseTeamIdParam(
    typeof idParam === 'string' ? idParam : Array.isArray(idParam) ? (idParam[0] ?? idFromPath) : idFromPath,
  );

  const seoLeague = facts?.league ? { id: facts.league.id, name: facts.league.name } : null;
  const title = teamName ? teamPageTitle(teamName, seoLeague, brandTitle) : brandTitle('Takım Detayı');
  const description = teamName
    ? teamPageDescription(teamName, seoLeague, facts?.coach)
    : 'Takımın son maçları, kadro bilgileri ve lig istatistikleri.';
  const summary = teamName ? buildTeamSummary(teamName, facts) : [];
  const ogImage = ogImagePath ? `${SITE_URL}${ogImagePath}` : null;
  // Canonical = og:url: sorgusuz, her iki alan adında da siteBaseUrl() (www.getscor3.com).
  const pageUrl = teamId ? `${SITE_URL}${teamHref(teamId, teamName)}` : null;
  const imageAlt = teamName ? `${teamName} — lig sırası ve son maçlar` : `${BRAND.name} takım sayfası`;

  return (
    <Container>
      <Head>
        <title>{title}</title>
        <meta name="description" content={clampDescription(description)} key="description" />
        <meta property="og:title" content={title} key="og:title" />
        <meta property="og:description" content={clampDescription(description)} key="og:description" />
        <meta property="og:type" content="website" key="og:type" />
        {pageUrl ? <link rel="canonical" href={pageUrl} key="canonical" /> : null}
        {pageUrl ? <meta property="og:url" content={pageUrl} key="og:url" /> : null}
        {ogImage ? (
          <>
            <meta property="og:image" content={ogImage} key="og:image" />
            <meta property="og:image:width" content="1200" key="og:image:width" />
            <meta property="og:image:height" content="630" key="og:image:height" />
            <meta property="og:image:alt" content={imageAlt} key="og:image:alt" />
          </>
        ) : null}
        <meta name="twitter:card" content={ogImage ? 'summary_large_image' : 'summary'} key="twitter:card" />
        <meta name="twitter:title" content={title} key="twitter:title" />
        <meta name="twitter:description" content={clampDescription(description)} key="twitter:description" />
        {ogImage ? <meta name="twitter:image" content={ogImage} key="twitter:image" /> : null}
        {ogImage ? <meta name="twitter:image:alt" content={imageAlt} key="twitter:image:alt" /> : null}
        {teamName && pageUrl ? <JsonLd schema={teamJsonLd(teamName, pageUrl, facts, ogImage)} /> : null}
        {teamName && pageUrl ? <JsonLd schema={breadcrumbJsonLd([{ name: teamName, url: pageUrl }])} /> : null}
      </Head>
      {/* H1 takım kartında: ad + logo ISR kabuğundan gelir, kart sunucu HTML'inde başlığı hemen çizer (LCP öğesi veri
          beklemez). Milli takım görünümü başlığı istemcide çizer → sunucu HTML'i için gizli H1. */}
      {teamName && isNationalMatchId(teamId) ? <h1 className={styles.srOnly}>{teamName}</h1> : null}
      <TeamDetailView
        key={teamId}
        teamId={teamId}
        variant="page"
        initialHeader={teamName ? { name: teamName, logo: facts?.logo ?? null } : null}
      />
      {/* Büyüme raporu 2.8 — "Takımım" sezon paketi (krediyle; yalnız Süper Lig, bayrak açıkken). */}
      {TEAM_PASS_ON && teamName && facts?.league?.slug === 'super-lig' ? <TeamPassCard teamId={Number(teamId)} teamName={teamName} /> : null}
      {summary.length ? (
        <section className={styles.about} aria-labelledby="takim-hakkinda">
          <h2 id="takim-hakkinda" className={styles.aboutTitle}>{teamName} hakkında</h2>
          <p className={styles.aboutText}>
            {summary.join(' ')}
            {facts?.league?.slug ? (
              <>
                {' '}
                <Link href={`/lig/${facts.league.slug}`} prefetch={false}>
                  {facts.league.name} puan durumu ve gol krallığı →
                </Link>
              </>
            ) : null}
          </p>
        </section>
      ) : null}
    </Container>
  );
}
