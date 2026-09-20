import Link from 'next/link';
import { useTranslation } from '@/lib/i18n';
import type { NewsItem } from '@/models/domain';
import { formatRelativeTime } from '@/utils/relativeTime';
import styles from './newsList.module.scss';

interface Props {
  items: NewsItem[];
  loading?: boolean;
}

export default function NewsList({ items, loading }: Props) {
  const { t } = useTranslation('match');

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
                <time className={styles.time}>{formatRelativeTime(item.publishedAt, t)}</time>
              </div>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
