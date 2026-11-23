import Link from 'next/link';
import { useTranslation } from '@/lib/i18n';
import { LATEST_NEWS_LIMIT, useLatestNews } from '@/hooks/useLatestNews';
import { formatRelativeTime } from '@/utils/relativeTime';
import styles from './homeNewsCard.module.scss';

const LIMIT = LATEST_NEWS_LIMIT;

/**
 * Son 3 AI haberi (en yeni üstte, en fazla 1 günlük). ≥ 1440 px: ana sayfa sağ paneli, Gündem'in üstü. Daha dar ekranda
 * ve maç seçiliyken maç listesinin içinde (`inList`: alt boşluk 12 px, diğer liste kartları gibi). Haber yoksa ya da
 * hata olursa kart hiç çizilmez; yüklenirken sabit yükseklikli iskelet.
 */
export default function HomeNewsCard({ inList = false }: { inList?: boolean }) {
  const { t } = useTranslation('match');
  const { data, isLoading } = useLatestNews();

  if (!isLoading && !data?.length) return null;

  return (
    <section className={inList ? `${styles.card} ${styles.inList}` : styles.card} aria-labelledby="home-news-title">
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
