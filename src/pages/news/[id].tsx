import type { GetStaticPaths, GetStaticProps } from 'next';
import Head from 'next/head';
import Image from 'next/image';
import Link from 'next/link';
import JsonLd from '@/components/JsonLd';
import Container from '@/components/Container';
import NewsList from '@/components/NewsList';
import { isOptimizableNewsImage } from '@/config/newsImageHosts';
import { BRAND_LOGO_PNG } from '@/config/brandImages';
import { BRAND, brandTitle } from '@/config/brand';
import { useTranslation } from '@/lib/i18n';
import { siteBaseUrl } from '@/lib/siteUrl';
import type { NewsItem } from '@/models/domain';
import styles from './newsDetail.module.scss';

/** Sunucu (UTC) ve tarayıcı aynı metni üretsin: saat dilimi sabit (hydration uyuşmazlığı olmasın). */
function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Istanbul',
  });
}

type Props = { article: NewsItem; sidebarNews: NewsItem[] };

/**
 * Haber detayı — ISR (SEO: başlık, metin, JSON-LD ve canonical ilk HTML'de). Kaynak: kalıcı arşiv (NewsArticle), yoksa
 * Redis deposu (arşive yazılmadan önceki dakikalar). Bulunamayan id gerçek 404 (soft 404 değil).
 */
export default function NewsDetail({ article, sidebarNews }: Props) {
  const { t } = useTranslation('match');
  const id = article.id;
  const pageTitle = brandTitle(article.title, '—');
  const pageDescription = (article.summary || article.content || article.title).slice(0, 160);
  // Canonical = og:url, sorgusuz; sunucuda çizilir.
  const pageUrl = `${siteBaseUrl()}/news/${encodeURIComponent(id)}`;

  return (
    <>
      <Head>
        <title>{pageTitle}</title>
        <meta name="description" content={pageDescription} />
        <meta property="og:title" content={article.title} />
        <meta property="og:description" content={pageDescription} />
        <meta property="og:type" content="article" key="og:type" />
        <link rel="canonical" href={pageUrl} key="canonical" />
        <meta property="og:url" content={pageUrl} key="og:url" />
        {article.image && (
          <>
            <meta property="og:image" content={article.image} key="og:image" />
            <meta property="og:image:alt" content={article.title} key="og:image:alt" />
            <meta name="twitter:card" content="summary_large_image" key="twitter:card" />
          </>
        )}
        <meta name="twitter:title" content={article.title} />
        <meta name="twitter:description" content={pageDescription} />
        {article.image && <meta name="twitter:image" content={article.image} key="twitter:image" />}
        {article.image && <meta name="twitter:image:alt" content={article.title} key="twitter:image:alt" />}
        <JsonLd schema={{
          '@context': 'https://schema.org',
          '@type': 'NewsArticle',
          headline: article.title,
          description: pageDescription,
          ...(article.image ? { image: article.image } : {}),
          datePublished: article.publishedAt,
          dateModified: article.publishedAt,
          mainEntityOfPage: pageUrl,
          inLanguage: 'tr-TR',
          articleSection: 'Futbol',
          author: { '@type': 'Organization', name: BRAND.name, url: siteBaseUrl() },
          publisher: {
            '@type': 'Organization',
            name: BRAND.name,
            logo: { '@type': 'ImageObject', url: `${siteBaseUrl()}${BRAND_LOGO_PNG}` },
          },
          ...(article.sources?.length ? { isBasedOn: article.sources.map((src) => src.url) } : {}),
        }} />
      </Head>
      <Container>
        <div className="layout-split">
          <div className="layout-left">
            <article className={styles.article}>
              <header className={styles.header}>
                <h1 className={styles.title}>{article.title}</h1>
                <div className={styles.meta}>
                  <span className={styles.source}>{article.source}</span>
                  <span className={styles.dot}>·</span>
                  <time className={styles.date}>{formatDate(article.publishedAt)}</time>
                </div>
              </header>

              {article.image && (
                <div className={styles.hero}>
                  <Image
                    src={article.image}
                    alt=""
                    className={styles.heroImg}
                    width={1200}
                    height={630}
                    style={{ width: '100%', height: 'auto' }}
                    unoptimized={!isOptimizableNewsImage(article.image)}
                  />
                </div>
              )}

              <div className={styles.body}>
                {article.ai && article.summary ? <p className={styles.lead}>{article.summary}</p> : null}
                {article.keyPoints?.length ? (
                  <section className={styles.keyPoints} aria-label={t('news.keyPoints')}>
                    <h2 className={styles.keyPointsTitle}>{t('news.keyPoints')}</h2>
                    <ul>
                      {article.keyPoints.map((k, i) => (
                        <li key={i}>{k}</li>
                      ))}
                    </ul>
                  </section>
                ) : null}
                {(article.content || article.summary || '').split('\n').map((p, i) =>
                  p.trim() ? <p key={i}>{p}</p> : null
                )}
              </div>

              <footer className={styles.footer}>
                {article.ai && article.sources?.length ? (
                  <>
                    <p className={styles.aiNote}>{t('news.aiNote')}</p>
                    <h2 className={styles.sourcesTitle}>{t('news.sources')}</h2>
                    <ul className={styles.sources}>
                      {article.sources.map((src) => (
                        <li key={src.url}>
                          <a href={src.url} target="_blank" rel="noopener noreferrer nofollow">
                            {src.name}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <a
                    href={article.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.sourceLink}
                  >
                    Haberin kaynağını oku →
                  </a>
                )}
              </footer>
            </article>
          </div>

          <aside className="layout-right">
            <div className={styles.sidebar}>
              <h3 className={styles.sidebarTitle}>Diğer Haberler</h3>
              <NewsList items={sidebarNews} />
              <Link href="/news" className={styles.sidebarAll}>{t('news.backToList')} →</Link>
            </div>
          </aside>
        </div>
      </Container>
    </>
  );
}

export const getStaticPaths: GetStaticPaths = async () => ({ paths: [], fallback: 'blocking' });

export const getStaticProps: GetStaticProps<Props> = async ({ params }) => {
  const id = String(params?.id ?? '');
  if (!/^[a-z0-9]{2,32}$/i.test(id)) return { notFound: true, revalidate: 3600 };
  // Ağır modüller yalnız sunucuda (istemci paketine girmesin).
  const { getArchivedNews } = await import('@/server/news/newsArchive');
  const { getLatestNews, readNewsStore } = await import('@/server/news/aiNews');
  const article = (await getArchivedNews(id)) ?? (await readNewsStore()).find((n) => n.id === id) ?? null;
  // Henüz yazılmamış / yanlış id: kısa süre sonra yeniden denensin (haber birkaç dakika içinde arşive düşebilir).
  if (!article) return { notFound: true, revalidate: 300 };
  const sidebarNews = (await getLatestNews())
    .filter((n) => n.id !== id)
    .slice(0, 6)
    .map(({ content: _c, keyPoints: _k, sources: _s, ...rest }) => rest);
  // JSON gidiş-dönüşü: undefined alan Next props serileştirmesini düşürmesin.
  return { props: JSON.parse(JSON.stringify({ article, sidebarNews })) as Props, revalidate: 900 };
};
