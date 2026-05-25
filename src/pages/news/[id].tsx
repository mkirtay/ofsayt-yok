import type { GetServerSideProps, InferGetServerSidePropsType } from 'next';
import { serverSideTranslations } from '@/lib/serverSideTranslations';
import Head from 'next/head';
import Image from 'next/image';
import JsonLd from '@/components/JsonLd';
import Container from '@/components/Container';
import NewsList from '@/components/NewsList';
import type { NewsItem } from '@/models/domain';
import { loadNewsDetailPageData } from '@/server/loadNewsDetailPageData';
import { propsJsonSafe } from '@/server/propsJsonSafe';
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

type NewsDetailPageProps = {
  newsDetail: {
    article: NewsItem;
    sidebarNews: NewsItem[];
  };
};

export default function NewsDetail({
  newsDetail,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const { article, sidebarNews } = newsDetail;

  const pageTitle = `${article.title} — Ofsayt Yok`;
  const pageDescription = (article.summary || article.content || article.title).slice(0, 160);

  return (
    <>
      <Head>
        <title>{pageTitle}</title>
        <meta name="description" content={pageDescription} />
        <meta property="og:title" content={article.title} />
        <meta property="og:description" content={pageDescription} />
        <meta property="og:type" content="article" />
        {article.image && <meta property="og:image" content={article.image} />}
        <meta name="twitter:card" content={article.image ? 'summary_large_image' : 'summary'} />
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

export const getServerSideProps: GetServerSideProps<NewsDetailPageProps> = async (ctx) => {
  ctx.res.setHeader(
    'Cache-Control',
    'public, s-maxage=120, stale-while-revalidate=300'
  );
  const rawId = ctx.params?.id;
  const id = typeof rawId === 'string' ? rawId : Array.isArray(rawId) ? rawId[0] : '';
  if (!id) return { notFound: true };

  const raw = await loadNewsDetailPageData(id);
  if (!raw) return { notFound: true };

  const i18nProps = await serverSideTranslations(ctx.locale ?? 'tr', ['common', 'nav', 'match']);
  return {
    props: {
      ...i18nProps,
      newsDetail: propsJsonSafe(raw),
    },
  };
};
