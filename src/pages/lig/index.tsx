import Head from 'next/head';
import Link from 'next/link';
import Container from '@/components/Container';
import { LEAGUE_HUBS } from '@/config/leagueHubs';
import { brandTitle } from '@/config/brand';
import { siteBaseUrl } from '@/lib/siteUrl';
import { sportmonksLeagueLogoUrl } from '@/utils/leagueLogo';
import styles from './lig.module.scss';

/** /lig — lig sayfalarının dizini (statik, veri isteği yok). */
export default function LeagueHubIndex() {
  const title = brandTitle('Ligler: Puan Durumu ve Gol Krallığı');
  const description = 'Süper Lig, Premier Lig, La Liga, Serie A, Bundesliga, Şampiyonlar Ligi ve daha fazlası: güncel puan durumları ve gol krallıkları.';
  return (
    <Container>
      <Head>
        <title>{title}</title>
        <meta name="description" content={description} key="description" />
        <link rel="canonical" href={`${siteBaseUrl()}/lig`} key="canonical" />
      </Head>
      <header className={styles.header}>
        <h1 className={styles.title}>Ligler</h1>
      </header>
      <p className={styles.summary}>{description}</p>
      <ul className={styles.hubGrid}>
        {LEAGUE_HUBS.map((h) => (
          <li key={h.slug}>
            <Link href={`/lig/${h.slug}`} className={styles.hubCard}>
              {sportmonksLeagueLogoUrl(h.leagueId) ? (
                // eslint-disable-next-line @next/next/no-img-element -- küçük lig logosu, CDN
                <img src={sportmonksLeagueLogoUrl(h.leagueId)!} alt="" width={28} height={28} loading="lazy" />
              ) : null}
              <span>
                <strong>{h.name}</strong>
                <small>{h.region}</small>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Container>
  );
}

export async function getStaticProps() {
  return { props: {} };
}
