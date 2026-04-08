import type { NewsItem } from '@/models/domain';
import styles from './newsList.module.scss';

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'Az önce';
  if (mins < 60) return `${mins} dk önce`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} saat önce`;
  const days = Math.floor(hours / 24);
  return `${days} gün önce`;
}

interface Props {
  items: NewsItem[];
  loading?: boolean;
}

export default function NewsList({ items, loading }: Props) {
  if (loading) {
    return <div className={styles.loading}>Haberler yükleniyor...</div>;
  }

  if (!items.length) {
    return <div className={styles.empty}>Şu an güncel haber bulunamadı.</div>;
  }

  return (
    <ul className={styles.list}>
      {items.map((item) => (
        <li key={item.id} className={styles.item}>
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.link}
          >
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
          </a>
        </li>
      ))}
    </ul>
  );
}
