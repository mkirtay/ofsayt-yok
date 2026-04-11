import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Container from '@/components/Container';
import NewsList from '@/components/NewsList';
import type { NewsItem } from '@/models/domain';
import { getNewsById, getNews } from '@/services/newsApi';
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
  const { id } = router.query;

  const [article, setArticle] = useState<NewsItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [sidebarNews, setSidebarNews] = useState<NewsItem[]>([]);

  useEffect(() => {
    if (!id || typeof id !== 'string') return;
    let cancelled = false;
    setLoading(true);

    Promise.all([getNewsById(id), getNews(6)]).then(([item, allNews]) => {
      if (cancelled) return;
      setArticle(item);
      setSidebarNews(allNews.filter((n) => n.id !== id).slice(0, 5));
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [id]);

  if (loading) {
    return (
      <Container>
        <div className={styles.loading}>Yükleniyor...</div>
      </Container>
    );
  }

  if (!article) {
    return (
      <Container>
        <div className={styles.notFound}>
          <h2>Haber bulunamadı</h2>
          <p>Bu haber artık mevcut değil veya süresi dolmuş olabilir.</p>
          <Link href="/" className={styles.backLink}>Ana sayfaya dön</Link>
        </div>
      </Container>
    );
  }

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
              {(article.content || article.summary || '').split('\n').map((p, i) => (
                p.trim() ? <p key={i}>{p}</p> : null
              ))}
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
