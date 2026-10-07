import type { GetStaticPaths, GetStaticProps } from 'next';
import Head from 'next/head';
import Container from '@/components/Container';
import JsonLd from '@/components/JsonLd';
import CoachView from '@/components/PersonPage/CoachView';
import type { CoachPageData } from '@/server/people/coachPage';
import { coachHref, COACH_BASE_PATH, personIdFromSlug, personSlug } from '@/utils/personUrl';
import { stripUndefined } from '@/utils/homeInitialData';
import { useTranslation } from '@/lib/i18n';
import { siteBaseUrl } from '@/lib/siteUrl';

type Props = { data: CoachPageData; /** Kanonik tam adres — sunucuda (istemcide AUTH_URL yok; JSON-LD hydration'ı eşleşsin). */ url: string };

const SITE_URL = siteBaseUrl();
const REVALIDATE_SECONDS = 3600;

export const getStaticPaths: GetStaticPaths = async () => ({ paths: [], fallback: 'blocking' });

export const getStaticProps: GetStaticProps<Props> = async ({ params }) => {
  const slug = String(params?.slug ?? '');
  const id = personIdFromSlug(slug);
  if (id == null) return { notFound: true, revalidate: 86_400 };
  const { loadCoachPage } = await import('@/server/people/coachPage');
  const data = await loadCoachPage(id);
  if (data === 'missing') return { notFound: true, revalidate: 86_400 };
  if (!data) throw new Error(`teknik direktör sayfası verisi alınamadı: ${id}`);
  const canonical = personSlug(data.name, id);
  if (slug !== canonical) return { redirect: { destination: `${COACH_BASE_PATH}/${canonical}`, statusCode: 301 }, revalidate: REVALIDATE_SECONDS };
  return { props: { data: stripUndefined(data) as CoachPageData, url: `${SITE_URL}${coachHref(id, data.name)}` }, revalidate: REVALIDATE_SECONDS };
};

export default function CoachPage({ data, url }: Props) {
  const { t } = useTranslation('match');
  const title = t('person.metaCoachTitle', { name: data.name });
  const description = t('person.metaCoachDesc', { name: data.name });
  return (
    <Container>
      <Head>
        <title>{title}</title>
        <meta name="description" content={description} key="description" />
        <link rel="canonical" href={url} />
        <meta property="og:title" content={title} key="og:title" />
        <meta property="og:description" content={description} key="og:description" />
        <meta property="og:type" content="profile" key="og:type" />
        <meta property="og:url" content={url} key="og:url" />
        {data.photo ? <meta property="og:image" content={data.photo} key="og:image" /> : null}
        <meta name="twitter:title" content={title} key="twitter:title" />
        <meta name="twitter:description" content={description} key="twitter:description" />
      </Head>
      <JsonLd
        schema={{
          '@context': 'https://schema.org',
          '@type': 'Person',
          name: data.name,
          url,
          jobTitle: 'Futbol teknik direktörü',
          ...(data.photo ? { image: data.photo } : {}),
          ...(data.nationality ? { nationality: { '@type': 'Country', name: data.nationality.name } } : {}),
          ...(data.currentTeam ? { worksFor: { '@type': 'SportsTeam', name: data.currentTeam.name } } : {}),
        }}
      />
      <CoachView data={data} />
    </Container>
  );
}
