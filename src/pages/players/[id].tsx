import type { GetStaticPaths, GetStaticProps } from 'next';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Container from '@/components/Container';
import JsonLd from '@/components/JsonLd';
import PlayerProfile from '@/components/PlayerProfile';
import { usePlayerProfile } from '@/hooks/usePlayerProfile';
import { brandTitle } from '@/config/brand';
import { siteBaseUrl } from '@/lib/siteUrl';
import { breadcrumbJsonLd } from '@/utils/breadcrumbJsonLd';
import type { PlayerSeo } from '@/utils/playerSeo';
import styles from '@/pages/teams/teamPage.module.scss';
import { clampDescription } from '@/utils/seoText';

type Props = { seo: PlayerSeo | null };

/**
 * ISR kabuğu (SEO raporu 2026-11-16: oyuncu sayfaları): ad, takım, mevki, son lig sezonu sunucu HTML'inde; profilin tamamı
 * eskisi gibi istemcide (aynı istek anahtarı → istemci önbellekten). Player havuzu (Fixture değil); 1 gün.
 */
export const getStaticPaths: GetStaticPaths = async () => ({ paths: [], fallback: 'blocking' });

export const getStaticProps: GetStaticProps<Props> = async ({ params }) => {
  const id = String(params?.id ?? '');
  if (!/^\d{1,10}$/.test(id)) return { notFound: true, revalidate: 86_400 };
  const [{ getPlayerProfile }, { buildPlayerSeo }, { withSportmonksTimeout, SPORTMONKS_TIMEOUT_MS }] = await Promise.all([
    import('@/services/playerProfile'),
    import('@/utils/playerSeo'),
    import('@/server/sportmonks/cachedFetch'),
  ]);
  const profile = await withSportmonksTimeout(SPORTMONKS_TIMEOUT_MS.page, () => getPlayerProfile(id)).catch(() => null);
  // Hata ya da oyuncu yok → kabuk (istemci kendi dener); kısa süre sonra yeniden.
  if (!profile) return { props: { seo: null }, revalidate: 300 };
  return { props: { seo: JSON.parse(JSON.stringify(buildPlayerSeo(profile))) as PlayerSeo }, revalidate: 86_400 };
};

/** /players/[id] — bağımsız oyuncu detay sayfası (panel DEĞİL). Kadro / İlk 11 / Gol Krallığı bağlantılarının hedefi. */
export default function PlayerPage({ seo = null }: Partial<Props> = {}) {
  const router = useRouter();
  const raw = router.query.id;
  const rawFromPath = router.asPath.match(/^\/players\/([^/?#]+)/)?.[1] ?? '';
  // Statik prerender sırasında `[id]` yer tutucusu gerçek id sanılmasın (takım sayfasındaki 422 bug'ının aynısı).
  const fromPath = /^\[.*\]$/.test(rawFromPath) ? '' : rawFromPath;
  const playerId = typeof raw === 'string' ? raw : Array.isArray(raw) ? (raw[0] ?? fromPath) : fromPath;
  const { data } = usePlayerProfile(playerId, Boolean(playerId));
  const name = data?.name ?? seo?.name ?? null;
  const title = brandTitle(name ? `${name} İstatistikleri, Kariyer ve Son Maçlar` : 'Oyuncu Detayı');
  const description = seo?.sentences.length
    ? `${seo.sentences.join(' ')} Sezon istatistikleri, kariyer ve transfer geçmişi.`
    : `${name ?? 'Oyuncu'} profili, sezon istatistikleri, transfer geçmişi ve son maçları.`;
  // Canonical = og:url, sorgusuz.
  const pageUrl = playerId ? `${siteBaseUrl()}/players/${playerId}` : null;

  return (
    <Container>
      <Head>
        <title>{title}</title>
        <meta name="description" content={clampDescription(description)} key="description" />
        {pageUrl ? <link rel="canonical" href={pageUrl} key="canonical" /> : null}
        {pageUrl ? <meta property="og:url" content={pageUrl} key="og:url" /> : null}
        {data?.photo ? <meta property="og:image" content={data.photo} key="og:image" /> : null}
      </Head>
      {seo && pageUrl ? (
        <>
          <JsonLd
            schema={{
              '@context': 'https://schema.org',
              '@type': 'Person',
              name: seo.name,
              url: pageUrl,
              jobTitle: 'Futbolcu',
              ...(seo.teamName ? { memberOf: { '@type': 'SportsTeam', name: seo.teamName } } : {}),
              ...(seo.nationality ? { nationality: { '@type': 'Country', name: seo.nationality } } : {}),
            }}
          />
          <JsonLd schema={breadcrumbJsonLd([{ name: seo.name, url: pageUrl }])} />
          {/* Görsel başlık profil kartında (istemcide); sunucu HTML'inde H1 + özet arama motorları / ekran okuyucu için. */}
          <h1 className={styles.srOnly}>{seo.name}</h1>
        </>
      ) : null}
      {playerId ? <PlayerProfile playerId={playerId} /> : null}
      {seo?.sentences.length ? (
        <section className={styles.about} aria-labelledby="oyuncu-hakkinda">
          <h2 id="oyuncu-hakkinda" className={styles.aboutTitle}>{seo.name} hakkında</h2>
          <p className={styles.aboutText}>{seo.sentences.join(' ')}</p>
        </section>
      ) : null}
    </Container>
  );
}
