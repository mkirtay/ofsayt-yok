import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from '@/lib/i18n';
import type { NewsItem } from '@/models/domain';
import { formatRelativeTime } from '@/utils/relativeTime';
import styles from './homeNewsCard.module.scss';

const LIMIT = 3;

async function fetchLatestNews(): Promise<NewsItem[]> {
  const res = await fetch(`/api/news?limit=${LIMIT}`);
  if (!res.ok) throw new Error('news');
  const json = (await res.json()) as { items?: NewsItem[] };
  return json.items ?? [];
}

/**
 * Ana sayfa sağ paneli, Gündem'in üstü: son 3 AI haberi (en yeni üstte, en fazla 1 günlük). Haber yoksa ya da hata
 * olursa kart hiç çizilmez (Gündem yukarı kayar); yüklenirken sabit yükseklikli iskelet.
 */
export default function HomeNewsCard() {
  const { t } = useTranslation('match');
  const { data, isLoading } = useQuery({
    queryKey: ['news-latest', LIMIT],
    queryFn: fetchLatestNews,
    staleTime: 2 * 60_000,
    refetchInterval: 5 * 60_000,
    retry: 1,
  });

  if (!isLoading && !data?.length) return null;

  return (
    <section className={styles.card} aria-labelledby="home-news-title">
      <div className={styles.head}>
        <h2 id="home-news-title" className={styles.title}>{t('news.title')}</h2>
        <Link href="/news" className={styles.all}>{t('news.all')}</Link>
      </div>
      {isLoading ? (
        <ul className={styles.list} aria-busy="true">
          {Array.from({ length: LIMIT }, (_, i) => (
            <li key={i} className={styles.skeletonRow}>
              <span className={styles.skeletonThumb} />
              <span className={styles.skeletonLines}>
                <span />
                <span />
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <ul className={styles.list}>
          {data!.map((item) => (
            <li key={item.id}>
              <Link href={`/news/${item.id}`} className={styles.row}>
                {item.image ? (
                  // Dış haber görseli: next/image yalnız izinli host'larda; küçük küçük resim için düz img.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.image} alt="" className={styles.thumb} loading="lazy" decoding="async" />
                ) : null}
                <span className={styles.body}>
                  <span className={styles.headline}>{item.title}</span>
                  <span className={styles.meta}>
                    <time dateTime={item.publishedAt}>{formatRelativeTime(item.publishedAt, t)}</time>
                    <span aria-hidden="true">·</span>
                    <span className={styles.source}>{item.source}</span>
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
