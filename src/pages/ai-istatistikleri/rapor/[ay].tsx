import type { GetStaticPaths, GetStaticProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import Container from '@/components/Container';
import JsonLd from '@/components/JsonLd';
import { BRAND, brandTitle } from '@/config/brand';
import { siteBaseUrl } from '@/lib/siteUrl';
import type { AiStatsHistoryItem, AiStatsMonth } from '@/lib/loadAiStatsDashboard';
import { breadcrumbJsonLd } from '@/utils/breadcrumbJsonLd';
import { buildMatchHref } from '@/utils/matchUrl';
import { monthLabel } from '@/utils/monthLabel';
import styles from '../ai-istatistikleri.module.scss';
import trMatch from '../../../../public/locales/tr/match.json';

const PICK_LABELS = (trMatch as { analysis: { pick: Record<string, string> } }).analysis.pick;

type Props = { month: string; stats: AiStatsMonth; items: AiStatsHistoryItem[] };

/**
 * Aylık AI isabet raporu (SEO/GEO raporu 2026-11-16: kaynak gösterilebilir, editörlere gönderilebilir sayfa). Herkese
 * açık görünümle aynı veri (yalnız değerlendirilmiş analizler, kart rozetleri). ISR: süren ay 1 sa, biten ay 1 gün.
 */
export const getStaticPaths: GetStaticPaths = async () => ({ paths: [], fallback: 'blocking' });

export const getStaticProps: GetStaticProps<Props> = async ({ params }) => {
  const month = String(params?.ay ?? '');
  if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month)) return { notFound: true, revalidate: 86_400 };
  const { loadAiMonthlyReport, istanbulMonth } = await import('@/lib/loadAiStatsDashboard');
  const { stats, items } = await loadAiMonthlyReport(month);
  if (!stats) return { notFound: true, revalidate: 3600 };
  const current = istanbulMonth(new Date()) === month;
  return { props: JSON.parse(JSON.stringify({ month, stats, items })) as Props, revalidate: current ? 3600 : 86_400 };
};

export default function AiMonthlyReport({ month, stats, items }: Props) {
  const label = monthLabel(month);
  const url = `${siteBaseUrl()}/ai-istatistikleri/rapor/${month}`;
  const heading = `${BRAND.name} yapay zekâ tahmin isabet raporu: ${label}`;
  const lead = `${label} ayında ${BRAND.name} yapay zekâ analizlerinin kartta gösterilen en güçlü 3 tahmini, değerlendirilen ${stats.matches} maçta ${stats.picks} tahminin ${stats.hits}’inde gerçekleşti: isabet oranı %${stats.rate.toLocaleString('tr-TR')}.`;
  return (
    <Container>
      <Head>
        <title>{brandTitle(`AI Maç Tahmini İsabet Raporu ${label}`)}</title>
        <meta name="description" content={lead} key="description" />
        <link rel="canonical" href={url} key="canonical" />
        <meta property="og:title" content={heading} key="og:title" />
        <meta property="og:description" content={lead} key="og:description" />
        <meta property="og:url" content={url} key="og:url" />
      </Head>
      <JsonLd
        schema={{
          '@context': 'https://schema.org',
          '@type': 'Dataset',
          name: heading,
          description: lead,
          url,
          creator: { '@type': 'Organization', name: BRAND.name },
          temporalCoverage: month,
          variableMeasured: ['değerlendirilen maç', 'tahmin', 'tutan tahmin', 'isabet oranı'],
        }}
      />
      <JsonLd
        schema={breadcrumbJsonLd([
          { name: 'AI isabet istatistikleri', url: `${siteBaseUrl()}/ai-istatistikleri` },
          { name: label, url },
        ])}
      />
      <div className={styles.page}>
        <div className={styles.hero}>
          <h1 className={styles.heroTitle}>{heading}</h1>
          <p className={styles.heroSub}>
            {lead} Ölçüm yöntemi: <Link href="/yontem">Yöntem</Link>. Tüm aylar: <Link href="/ai-istatistikleri">AI isabet istatistikleri</Link>.
          </p>
        </div>
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>{label} maçları</h2>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Maç</th>
                  <th scope="col">En güçlü 3 tahmin</th>
                  <th scope="col">Tutan</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => {
                  const known = it.topPicks.filter((p) => p.hit != null);
                  return (
                    <tr key={it.matchId}>
                      <td>
                        <Link href={buildMatchHref({ id: Number(it.matchId), home: { name: it.homeTeamName }, away: { name: it.awayTeamName } })} prefetch={false}>
                          {it.homeTeamName} - {it.awayTeamName}
                        </Link>
                      </td>
                      <td>{it.topPicks.map((p) => `${p.hit === true ? '✓' : p.hit === false ? '✗' : '·'} ${PICK_LABELS[p.key] ?? p.key} %${p.pct}`).join(' · ')}</td>
                      <td>
                        {known.filter((p) => p.hit).length}/{known.length}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Container>
  );
}
