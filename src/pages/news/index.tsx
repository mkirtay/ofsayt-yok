import Head from 'next/head';
import Link from 'next/link';
import type { GetStaticProps } from 'next';
import Container from '@/components/Container';
import { brandTitle } from '@/config/brand';
import { useTranslation } from '@/lib/i18n';
import { siteBaseUrl } from '@/lib/siteUrl';
import type { NewsItem } from '@/models/domain';
import { formatRelativeTime } from '@/utils/relativeTime';
import styles from './newsIndex.module.scss';

type Props = { items: NewsItem[] };

/**
 * /news — son 24 saatin AI haberleri, en yeni en üstte (ana sayfa kartının "Tümü" bağlantısı). ISR 5 dk: liste ilk
 * HTML'de (SEO, haber sayfalarına iç bağlantı).
 */
export default function NewsIndexPage({ items }: Props) {
  const { t } = useTranslation('match');
  const data = items;
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
          {!data.length ? (
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
                        <time dateTime={item.publishedAt} suppressHydrationWarning>{formatRelativeTime(item.publishedAt, t)}</time>
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

export const getStaticProps: GetStaticProps<Props> = async () => {
  const { getLatestNews } = await import('@/server/news/aiNews');
  const items = (await getLatestNews()).map(({ content: _c, keyPoints: _k, sources: _s, ...rest }) => rest);
  // JSON gidiş-dönüşü: undefined alan Next props serileştirmesini düşürmesin.
  return { props: JSON.parse(JSON.stringify({ items })) as Props, revalidate: 300 };
};
