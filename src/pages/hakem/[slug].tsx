import type { GetStaticPaths, GetStaticProps } from 'next';
import Head from 'next/head';
import Container from '@/components/Container';
import JsonLd from '@/components/JsonLd';
import RefereeView from '@/components/PersonPage/RefereeView';
import type { RefereePageData } from '@/server/people/refereePage';
import { personIdFromSlug, personSlug, refereeHref, REFEREE_BASE_PATH } from '@/utils/personUrl';
import { stripUndefined } from '@/utils/homeInitialData';
import { useTranslation } from '@/lib/i18n';

type Props = { data: RefereePageData; /** Kanonik tam adres — sunucuda (istemcide AUTH_URL yok; JSON-LD hydration'ı eşleşsin). */ url: string };

const SITE_URL = process.env.AUTH_URL ?? 'https://ofsaytyok.app';
/** Son maçlar 1 sa; sayfa da 1 sa (Sportmonks verisi alt katmanda daha uzun cache'li). */
const REVALIDATE_SECONDS = 3600;

export const getStaticPaths: GetStaticPaths = async () => ({ paths: [], fallback: 'blocking' });

export const getStaticProps: GetStaticProps<Props> = async ({ params }) => {
  const slug = String(params?.slug ?? '');
  const id = personIdFromSlug(slug);
  if (id == null) return { notFound: true, revalidate: 86_400 };
  const { loadRefereePage } = await import('@/server/people/refereePage');
  const data = await loadRefereePage(id);
  if (data === 'missing') return { notFound: true, revalidate: 86_400 };
  // Geçici hata: Next son başarılı sayfayı vermeye devam eder (ilk üretimde 404 değil hata).
  if (!data) throw new Error(`hakem sayfası verisi alınamadı: ${id}`);
  const canonical = personSlug(data.name, id);
  if (slug !== canonical) return { redirect: { destination: `${REFEREE_BASE_PATH}/${canonical}`, statusCode: 301 }, revalidate: REVALIDATE_SECONDS };
  return { props: { data: stripUndefined(data) as RefereePageData, url: `${SITE_URL}${refereeHref(id, data.name)}` }, revalidate: REVALIDATE_SECONDS };
};

export default function RefereePage({ data, url }: Props) {
  const { t } = useTranslation('match');
  const title = t('person.metaRefereeTitle', { name: data.name });
  const description = t('person.metaRefereeDesc', { name: data.name });
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
        <meta name="twitter:title" content={title} key="twitter:title" />
        <meta name="twitter:description" content={description} key="twitter:description" />
      </Head>
      <JsonLd
        schema={{
          '@context': 'https://schema.org',
          '@type': 'Person',
          name: data.name,
          url,
          jobTitle: 'Futbol hakemi',
          ...(data.country ? { nationality: { '@type': 'Country', name: data.country.name } } : {}),
        }}
      />
      <RefereeView data={data} />
    </Container>
  );
}
