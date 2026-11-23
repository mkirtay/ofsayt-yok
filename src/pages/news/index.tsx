import Head from 'next/head';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import Container from '@/components/Container';
import { PanelSkeleton } from '@/components/Skeleton';
import { brandTitle } from '@/config/brand';
import { useTranslation } from '@/lib/i18n';
import { siteBaseUrl } from '@/lib/siteUrl';
import type { NewsItem } from '@/models/domain';
import { formatRelativeTime } from '@/utils/relativeTime';
import styles from './newsIndex.module.scss';

async function fetchNews(): Promise<NewsItem[]> {
  const res = await fetch('/api/news?limit=50');
  if (!res.ok) throw new Error('news');
  return ((await res.json()) as { items?: NewsItem[] }).items ?? [];
}

/** /news — son 24 saatin AI haberleri, en yeni en üstte (ana sayfa kartının "Tümü" bağlantısı). */
export default function NewsIndexPage() {
  const { t } = useTranslation('match');
  const { data, isLoading } = useQuery({ queryKey: ['news-all'], queryFn: fetchNews, staleTime: 2 * 60_000 });
  const title = t('news.pageTitle');

  return (
    <>
      <Head>
        <title>{brandTitle(title, '—')}</title>
        <meta name="description" content={t('news.pageIntro')} />
        <link rel="canonical" href={`${siteBaseUrl()}/news`} key="canonical" />
      </Head>
      <Container>
        <div className={styles.page}>
          <header className={styles.header}>
            <h1 className={styles.title}>{title}</h1>
            <p className={styles.intro}>{t('news.pageIntro')}</p>
          </header>
          {isLoading ? (
            <PanelSkeleton rows={6} />
          ) : !data?.length ? (
            <p className={styles.empty}>{t('news.empty')}</p>
          ) : (
            <ul className={styles.list}>
              {data.map((item) => (
                <li key={item.id}>
                  <Link href={`/news/${item.id}`} className={styles.item}>
                    {item.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.image} alt="" className={styles.thumb} loading="lazy" decoding="async" />
                    ) : null}
                    <span className={styles.body}>
                      <span className={styles.headline}>{item.title}</span>
                      {item.summary ? <span className={styles.summary}>{item.summary}</span> : null}
                      <span className={styles.meta}>
                        <time dateTime={item.publishedAt}>{formatRelativeTime(item.publishedAt, t)}</time>
                        <span aria-hidden="true">·</span>
                        <span>{item.source}</span>
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Container>
    </>
  );
}
