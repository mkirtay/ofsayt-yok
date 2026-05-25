import Link from 'next/link';
import { useTranslation } from '@/lib/i18n';
import type { NewsItem } from '@/models/domain';
import styles from './newsList.module.scss';

interface Props {
  items: NewsItem[];
  loading?: boolean;
}

export default function NewsList({ items, loading }: Props) {
  const { t } = useTranslation('match');

  function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 1) return t('news.justNow');
    if (mins < 60) return t('news.minutesAgo', { count: mins });
    const hours = Math.floor(mins / 60);
    if (hours < 24) return t('news.hoursAgo', { count: hours });
    const days = Math.floor(hours / 24);
    return t('news.daysAgo', { count: days });
  }

  if (loading) {
    return <div className={styles.loading}>{t('news.loading')}</div>;
  }

  if (!items.length) {
    return <div className={styles.empty}>{t('news.empty')}</div>;
  }

  return (
    <ul className={styles.list}>
      {items.map((item) => (
        <li key={item.id} className={styles.item}>
          <Link href={`/news/${item.id}`} className={styles.link}>
            {item.image && (
              <img
                src={item.image}
                alt=""
                className={styles.thumb}
                loading="lazy"
              />
            )}
            <div className={styles.content}>
              <h4 className={styles.title}>{item.title}</h4>
              <div className={styles.meta}>
                <span className={styles.source}>{item.source}</span>
                <span className={styles.dot}>·</span>
                <time className={styles.time}>{timeAgo(item.publishedAt)}</time>
              </div>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
