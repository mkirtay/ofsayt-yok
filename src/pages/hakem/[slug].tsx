import type { GetStaticPaths, GetStaticProps } from 'next';
import Head from 'next/head';
import Container from '@/components/Container';
import { breadcrumbJsonLd } from '@/utils/breadcrumbJsonLd';
import JsonLd from '@/components/JsonLd';
import { buildRefereeSummary, refereePageTitle } from '@/utils/refereeSeo';
import { brandTitle } from '@/config/brand';
import RefereeView from '@/components/PersonPage/RefereeView';
import type { RefereePageData } from '@/server/people/refereePage';
import { personIdFromSlug, personSlug, refereeHref, REFEREE_BASE_PATH } from '@/utils/personUrl';
import { stripUndefined } from '@/utils/homeInitialData';
import { useI18n, useTranslation } from '@/lib/i18n';
import { siteBaseUrl } from '@/lib/siteUrl';
import { clampDescription } from '@/utils/seoText';

type Props = { data: RefereePageData; /** Kanonik tam adres — sunucuda (istemcide AUTH_URL yok; JSON-LD hydration'ı eşleşsin). */ url: string };

const SITE_URL = siteBaseUrl();
/** Sayfa verisiyle aynı 6 sa (tek Sportmonks isteği 6 sa cache'li; bkz. server/people/refereePage.ts). */
const REVALIDATE_SECONDS = 6 * 60 * 60;

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
  const { locale } = useI18n();
  // Türkçe: kademeli şablon (≤60); İngilizce çeviri metni.
  const title = locale === 'en' ? t('person.metaRefereeTitle', { name: data.name }) : refereePageTitle(data.name, brandTitle);
  // Alıntılanabilir ilk cümle varsa açıklama o (SEO/GEO); yoksa genel metin.
  const description = buildRefereeSummary(data)[0] ?? t('person.metaRefereeDesc', { name: data.name });
  return (
    <Container>
      <Head>
        <title>{title}</title>
        <meta name="description" content={clampDescription(description)} key="description" />
        <link rel="canonical" href={url} />
        <meta property="og:title" content={title} key="og:title" />
        <meta property="og:description" content={clampDescription(description)} key="og:description" />
        <meta property="og:type" content="profile" key="og:type" />
        <meta property="og:url" content={url} key="og:url" />
        <meta name="twitter:title" content={title} key="twitter:title" />
        <meta name="twitter:description" content={clampDescription(description)} key="twitter:description" />
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
      <JsonLd schema={breadcrumbJsonLd([{ name: 'Hakemler', url: `${SITE_URL}/hakemler` }, { name: data.name, url }])} />
      <RefereeView data={data} />
    </Container>
  );
}
