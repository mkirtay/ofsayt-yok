import type { GetServerSideProps, InferGetServerSidePropsType } from 'next';
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

  return (
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
                <img src={article.image} alt="" className={styles.heroImg} />
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

  return {
    props: {
      newsDetail: propsJsonSafe(raw),
    },
  };
};
