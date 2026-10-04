import type { GetStaticPaths, GetStaticProps } from 'next';
import Head from 'next/head';
import Container from '@/components/Container';
import JsonLd from '@/components/JsonLd';
import RefereeTableView from '@/components/PersonPage/RefereeTableView';
import type { RefereeLeagueTable } from '@/server/people/refereeLeagueTable';
import { DEFAULT_REFEREE_TABLE_LEAGUE, refereeTablePath, shortSeasonName } from '@/config/refereeTableLeagues';
import { stripUndefined } from '@/utils/homeInitialData';
import { useTranslation } from '@/lib/i18n';

type Props = { data: RefereeLeagueTable; url: string };

const SITE_URL = process.env.AUTH_URL ?? 'https://ofsaytyok.app';
/** Tablo 12 sa (hakem istatistikleri de 12 sa cache'li). */
const REVALIDATE_SECONDS = 12 * 60 * 60;

export const getStaticPaths: GetStaticPaths = async () => ({ paths: [], fallback: 'blocking' });

/** `/hakemler` → Süper Lig güncel; `/hakemler/{lig}`; `/hakemler/{lig}/{2025-2026}`. */
export const getStaticProps: GetStaticProps<Props> = async ({ params }) => {
  const parts = (params?.params as string[] | undefined) ?? [];
  if (parts.length > 2) return { notFound: true, revalidate: 86_400 };
  const leagueSlug = parts[0] ?? DEFAULT_REFEREE_TABLE_LEAGUE.slug;
  const seasonSlug = parts[1] ?? null;
  const { loadRefereeLeagueTable } = await import('@/server/people/refereeLeagueTable');
  const data = await loadRefereeLeagueTable(leagueSlug, seasonSlug);
  if (data === 'missing') return { notFound: true, revalidate: 86_400 };
  if (!data) throw new Error(`hakem tablosu alınamadı: ${leagueSlug}/${seasonSlug ?? ''}`);
  const url = `${SITE_URL}${refereeTablePath(data.league.slug, data.season.slug, data.season.isCurrent)}`;
  return { props: { data: stripUndefined(data) as RefereeLeagueTable, url }, revalidate: REVALIDATE_SECONDS };
};

export default function RefereesPage({ data, url }: Props) {
  const { t } = useTranslation('match');
  const { t: tl } = useTranslation('leagues');
  const league = tl(`short.${data.league.nameKey}`);
  // Başlık kısa sezonla: "Süper Lig Hakem İstatistikleri 2026/27"
  const title = `${t('person.tableTitle', { league, season: shortSeasonName(data.season.name) })} | Ofsayt Yok`;
  const description = t('person.tableDesc', { league, season: data.season.name });
  return (
    <Container>
      <Head>
        <title>{title}</title>
        <meta name="description" content={description} key="description" />
        <link rel="canonical" href={url} />
        <meta property="og:title" content={title} key="og:title" />
        <meta property="og:description" content={description} key="og:description" />
        <meta property="og:type" content="website" key="og:type" />
        <meta property="og:url" content={url} key="og:url" />
        <meta name="twitter:title" content={title} key="twitter:title" />
        <meta name="twitter:description" content={description} key="twitter:description" />
      </Head>
      <JsonLd
        schema={{
          '@context': 'https://schema.org',
          '@type': 'Dataset',
          name: title.replace(/ \| Ofsayt Yok$/, ''),
          description,
          url,
          variableMeasured: ['maç', 'maç başı sarı kart', 'maç başı kırmızı kart', 'maç başı penaltı', 'maç başı faul', 'maç başı VAR incelemesi'],
        }}
      />
      <RefereeTableView data={data} />
    </Container>
  );
}
