import '@/lib/i18nNamespaces/standings';
import type { GetStaticPaths, GetStaticProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import Container from '@/components/Container';
import JsonLd from '@/components/JsonLd';
import { ScorersList, StandingsTable } from '@/components/StandingsView';
import { standingsGroupHeading } from '@/components/MatchCompetitionStandings/groupHeading';
import { hubHasWeeks, LEAGUE_HUBS, leagueHubBySlug, type LeagueHub } from '@/config/leagueHubs';
import { brandTitle, BRAND } from '@/config/brand';
import { useTranslation } from '@/lib/i18n';
import { siteBaseUrl } from '@/lib/siteUrl';
import type { CompetitionTableData, TopScorerEntry } from '@/services/liveScoreService';
import { buildLeagueSummary } from '@/utils/leagueHubSeo';
import { hubSelectionIdForLeague } from '@/utils/hubLeagueSelection';
import { sportmonksLeagueLogoUrl } from '@/utils/leagueLogo';
import { toStandingsBlocks } from '@/utils/standingsBlocks';
import styles from './lig.module.scss';
import { standingsEmbedSnippet } from '@/utils/embedSnippet';
import { teamHref } from '@/utils/teamUrl';
import { clampDescription } from '@/utils/seoText';

type Props = {
  hub: LeagueHub;
  table: CompetitionTableData | null;
  scorers: TopScorerEntry[];
  seasonName: string | null;
  updatedAt: string;
};

const SCORERS_SHOWN = 10;
/** Puan durumu maç günlerinde değişir; 30 dk ISR = lig başına saatte en çok ~2 × (tablo + gol krallığı) isteği. */
const REVALIDATE_SECONDS = 1800;

export const getStaticPaths: GetStaticPaths = async () => ({ paths: [], fallback: 'blocking' });

export const getStaticProps: GetStaticProps<Props> = async ({ params }) => {
  const hub = leagueHubBySlug(String(params?.slug ?? ''));
  if (!hub) return { notFound: true, revalidate: 86_400 };
  const [{ getCompetitionStandings }, { getTopScorersWithAppearances }, { withSportmonksTimeout, SPORTMONKS_TIMEOUT_MS }, { propsJsonSafe }] =
    await Promise.all([
      import('@/services/competitionStandings'),
      import('@/services/competitionTopScorers'),
      import('@/server/sportmonks/cachedFetch'),
      import('@/server/propsJsonSafe'),
    ]);
  const id = String(hub.leagueId);
  const [table, scorers] = await Promise.all([
    withSportmonksTimeout(SPORTMONKS_TIMEOUT_MS.page, () => getCompetitionStandings(id)).catch(() => null),
    withSportmonksTimeout(SPORTMONKS_TIMEOUT_MS.page, () => getTopScorersWithAppearances(id)).catch(() => null),
  ]);
  const ok = table != null;
  return {
    props: propsJsonSafe({
      hub,
      table,
      scorers: (scorers?.topscorers ?? []).slice(0, SCORERS_SHOWN),
      seasonName: table?.season?.name ?? null,
      updatedAt: new Date().toISOString(),
    }),
    // Geçici hata (tablo yok): kısa süre sonra yeniden dene; hata ≠ veri yok.
    revalidate: ok ? REVALIDATE_SECONDS : 60,
  };
};

export default function LeagueHubPage({ hub, table, scorers, seasonName, updatedAt }: Props) {
  const { t: tm } = useTranslation('match');
  const url = `${siteBaseUrl()}/lig/${hub.slug}`;
  const blocks = toStandingsBlocks(table, (name) => standingsGroupHeading(name, tm));
  const firstRows = blocks.length === 1 ? blocks[0]!.rows : [];
  const summary = buildLeagueSummary(hub.name, firstRows, scorers);
  const season = seasonName ? ` ${seasonName}` : '';
  const title = brandTitle(`${hub.name} Puan Durumu ve Gol Krallığı${season}`);
  const description = `${summary.length ? `${summary.slice(0, 2).join(' ')} ` : ''}${hub.name}${season} güncel puan durumu, gol krallığı ve takımların son 5 maç formu.`;
  const updated = new Date(updatedAt).toLocaleString('tr-TR', {
    timeZone: 'Europe/Istanbul',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });
  const logo = sportmonksLeagueLogoUrl(hub.leagueId);
  const others = LEAGUE_HUBS.filter((h) => h.slug !== hub.slug);

  return (
    <Container>
      <Head>
        <title>{title}</title>
        <meta name="description" content={clampDescription(description)} key="description" />
        <link rel="canonical" href={url} key="canonical" />
        <meta property="og:title" content={title} key="og:title" />
        <meta property="og:description" content={clampDescription(description)} key="og:description" />
        <meta property="og:url" content={url} key="og:url" />
        <meta property="og:type" content="website" key="og:type" />
      </Head>
      <JsonLd
        schema={{
          '@context': 'https://schema.org',
          '@graph': [
            {
              '@type': 'SportsOrganization',
              name: hub.name,
              sport: 'Soccer',
              url,
              ...(logo ? { logo } : {}),
              ...(firstRows.length
                ? { member: firstRows.slice(0, 30).map((r) => ({ '@type': 'SportsTeam', name: r.team?.name || r.name, ...(r.team?.id ? { url: `${siteBaseUrl()}${teamHref(r.team.id, r.team?.name || r.name)}` } : {}) })) }
                : {}),
            },
            {
              '@type': 'BreadcrumbList',
              itemListElement: [
                { '@type': 'ListItem', position: 1, name: BRAND.name, item: siteBaseUrl() },
                { '@type': 'ListItem', position: 2, name: 'Ligler', item: `${siteBaseUrl()}/lig` },
                { '@type': 'ListItem', position: 3, name: hub.name, item: url },
              ],
            },
          ],
        }}
      />

      <header className={styles.header}>
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element -- küçük lig logosu, CDN
          <img className={styles.logo} src={logo} alt="" width={40} height={40} />
        ) : null}
        <div>
          <h1 className={styles.title}>
            {hub.name} Puan Durumu{season}
          </h1>
          <p className={styles.meta}>
            {hub.region} · Son güncelleme: {updated} (TSİ)
          </p>
        </div>
      </header>

      {summary.length ? <p className={styles.summary}>{summary.join(' ')}</p> : null}
      {hubHasWeeks(hub) ? (
        <p className={styles.more}>
          <Link href={`/lig/${hub.slug}/hafta`} prefetch={false}>
            Bu haftanın maçları, sonuçları ve hakem atamaları →
          </Link>
        </p>
      ) : null}

      <section className={styles.section} aria-labelledby="puan-durumu">
        <h2 id="puan-durumu" className={styles.sectionTitle}>
          {hub.name} puan tablosu
        </h2>
        {blocks.length ? (
          <StandingsTable blocks={blocks} competitionId={hub.leagueId} />
        ) : (
          <p className={styles.empty}>Puan durumu şu an yüklenemedi; birkaç dakika sonra yenileyin.</p>
        )}
      </section>

      {scorers.length ? (
        <section className={styles.section} aria-labelledby="gol-kralligi">
          <h2 id="gol-kralligi" className={styles.sectionTitle}>
            {hub.name} gol krallığı
          </h2>
          <ScorersList rows={scorers} />
        </section>
      ) : null}

      <p className={styles.more}>
        <Link href={`/standings?league=${hubSelectionIdForLeague(hub.leagueId)}`}>
          Tüm istatistikler: kartlar, haftanın 11&apos;i, geçmiş sezonlar →
        </Link>
      </p>

      <details className={styles.section}>
        <summary className={styles.embedSummary}>Bu puan durumunu sitene ekle</summary>
        <p className={styles.embedHint}>
          Aşağıdaki kodu sitene yapıştır; tablo kendiliğinden güncellenir. Koyu tema için adresin sonuna <code>?tema=koyu</code> ekle.
        </p>
        <textarea className={styles.embedCode} readOnly rows={3} value={standingsEmbedSnippet(siteBaseUrl(), hub.slug, hub.name)} aria-label="Gömme kodu" />
      </details>

      <nav className={styles.section} aria-labelledby="diger-ligler">
        <h2 id="diger-ligler" className={styles.sectionTitle}>
          Diğer ligler
        </h2>
        <ul className={styles.leagueLinks}>
          {others.map((h) => (
            <li key={h.slug}>
              <Link href={`/lig/${h.slug}`}>{h.name} puan durumu</Link>
            </li>
          ))}
        </ul>
      </nav>
    </Container>
  );
}
