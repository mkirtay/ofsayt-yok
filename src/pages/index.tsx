import type { GetStaticProps } from 'next';
import Head from 'next/head';
import JsonLd from '@/components/JsonLd';
import MatchHubPage from '@/components/MatchHubPage';
import { HOME_SIDEBAR_LEAGUES } from '@/config/leagues';
import type { HomeInitialData } from '@/utils/homeInitialData';
import { todayIsoIstanbul } from '@/utils/dateStrip';
import { siteBaseUrl } from '@/lib/siteUrl';
import { BRAND_LOGO_PNG } from '@/config/brandImages';
import { BRAND, socialProfileUrls } from '@/config/brand';

const DEFAULT_COMPETITION_ID = 6;

type HomeProps = {
  /** Sayfanın üretildiği TR günü (veri alınamasa da dolu). */
  initialDate: string;
  /** `null` → veri alınamadı (build sırasında): bugünkü istemci kabuğu, veri tarayıcıda çekilir. */
  initialData: HomeInitialData | null;
};

/**
 * ISR: ilk ekran (maç listesi / sıradaki maç günü / puan durumu) HTML'e girer → LCP JS'i ve `/api/matches/day`'i
 * beklemez, iskelet→içerik kayması olmaz. Süre maç durumuna göre (bkz. `homeRevalidateSeconds`).
 * Hata: build sırasında kabuğa düşülür (build düşmesin, 60 sn sonra yeniden denenir); çalışma anındaki yeniden
 * üretimde hata fırlatılır → Next son başarılı sayfayı vermeye devam eder.
 */
export const getStaticProps: GetStaticProps<HomeProps> = async () => {
  const { loadHomeInitialData, HOME_REVALIDATE_FAILED } = await import('@/server/homeInitialData');
  const { SPORTMONKS_TIMEOUT_MS, withSportmonksTimeout } = await import('@/server/sportmonks/cachedFetch');
  const initialDate = todayIsoIstanbul();
  try {
    // Sportmonks bütçesi sayfa render'ı için kısa (zaman aşımı → hata → son başarılı sayfa kalır).
    const { data, revalidate } = await withSportmonksTimeout(SPORTMONKS_TIMEOUT_MS.page, () =>
      loadHomeInitialData(initialDate, DEFAULT_COMPETITION_ID),
    );
    return { props: { initialDate, initialData: data }, revalidate };
  } catch (error) {
    if (process.env.NEXT_PHASE !== 'phase-production-build') throw error;
    console.error('[home] build sırasında ilk ekran verisi alınamadı — boş kabuk', error);
    return { props: { initialDate, initialData: null }, revalidate: HOME_REVALIDATE_FAILED };
  }
};

const HOME_TITLE = `${BRAND.name} — Canlı Maç Sonuçları & Analiz`;

export default function Home({ initialDate, initialData }: HomeProps) {
  return (
    <>
      <Head>
        <title>{HOME_TITLE}</title>
        <meta name="description" content="Türkiye Süper Lig, UEFA ve dünya futbolundan canlı skorlar, maç analizleri, puan durumu ve spor haberleri." />
        <meta property="og:title" content={HOME_TITLE} />
        <meta property="og:description" content="Türkiye Süper Lig, UEFA ve dünya futbolundan canlı skorlar, maç analizleri, puan durumu ve spor haberleri." />
        <meta property="og:url" content={siteBaseUrl()} />
        <link rel="canonical" href={siteBaseUrl()} />
        <JsonLd schema={{
          '@context': 'https://schema.org',
          '@type': 'Organization',
          name: BRAND.name,
          url: siteBaseUrl(),
          logo: `${siteBaseUrl()}${BRAND_LOGO_PNG}`,
          description: BRAND.description,
          ...(socialProfileUrls().length > 0 && { sameAs: socialProfileUrls() }),
        }} />
      </Head>
      <MatchHubPage
        sidebarLeagues={HOME_SIDEBAR_LEAGUES}
        defaultCompetitionId={DEFAULT_COMPETITION_ID}
        allowedCompetitionIds={null}
        initialDate={initialDate}
        initialData={initialData}
      />
    </>
  );
}
