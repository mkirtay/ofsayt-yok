import Head from 'next/head';
import Image from 'next/image';
import { useRouter } from 'next/router';
import JsonLd from '@/components/JsonLd';
import Container from '@/components/Container';
import NewsList from '@/components/NewsList';
import { PanelSkeleton } from '@/components/Skeleton';
import { useNewsDetail } from '@/hooks/useNewsDetail';
import styles from './newsDetail.module.scss';

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function NewsDetail() {
  const router = useRouter();
  const idParam = router.query.id;
  const idFromPath = router.asPath.match(/^\/news\/([^/?#]+)/)?.[1] ?? '';
  const id =
    typeof idParam === 'string'
      ? idParam
      : Array.isArray(idParam)
        ? idParam[0] ?? idFromPath
        : idFromPath;

  const { data, isLoading, isError } = useNewsDetail(id, router.isReady || Boolean(idFromPath));

  if (isLoading) {
    return (
      <Container>
        <div className="layout-split">
          <div className="layout-left">
            <PanelSkeleton rows={8} />
          </div>
          <aside className="layout-right">
            <PanelSkeleton rows={5} />
          </aside>
        </div>
      </Container>
    );
  }

  if (isError || !data) {
    return (
      <Container>
        <div className={styles.notFound}>Haber bulunamadı.</div>
      </Container>
    );
  }

  const { article, sidebarNews } = data;
  const pageTitle = `${article.title} — Ofsayt Yok`;
  const pageDescription = (article.summary || article.content || article.title).slice(0, 160);

  return (
    <>
      <Head>
        <title>{pageTitle}</title>
        <meta name="description" content={pageDescription} />
        <meta property="og:title" content={article.title} />
        <meta property="og:description" content={pageDescription} />
        <meta property="og:type" content="article" key="og:type" />
        {article.image && (
          <>
            <meta property="og:image" content={article.image} key="og:image" />
            <meta name="twitter:card" content="summary_large_image" key="twitter:card" />
          </>
        )}
        <meta name="twitter:title" content={article.title} />
        <meta name="twitter:description" content={pageDescription} />
        {article.image && <meta name="twitter:image" content={article.image} />}
        <JsonLd schema={{
          '@context': 'https://schema.org',
          '@type': 'NewsArticle',
          headline: article.title,
          description: pageDescription,
          ...(article.image ? { image: article.image } : {}),
          datePublished: article.publishedAt,
          publisher: { '@type': 'Organization', name: 'Ofsayt Yok', logo: `${process.env.AUTH_URL ?? 'https://ofsaytyok.app'}/images/logo.svg` },
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
                  />
                </div>
              )}

              <div className={styles.body}>
                {(article.content || article.summary || '').split('\n').map((p, i) =>
                  p.trim() ? <p key={i}>{p}</p> : null
                )}
              </div>

              <footer className={styles.footer}>
                <a
                  href={article.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.sourceLink}
                >
                  Haberin kaynağını oku →
                </a>
              </footer>
            </article>
          </div>

          <aside className="layout-right">
            <div className={styles.sidebar}>
              <h3 className={styles.sidebarTitle}>Diğer Haberler</h3>
              <NewsList items={sidebarNews} />
            </div>
          </aside>
        </div>
      </Container>
    </>
  );
}
