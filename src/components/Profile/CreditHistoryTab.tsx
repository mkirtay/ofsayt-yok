import Link from 'next/link';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useI18n, useTranslation } from '@/lib/i18n';
import type { CreditHistoryItem, CreditHistoryPage } from '@/pages/api/credits/history';
import styles from './profile.module.scss';

const PAGE_SIZE = 20;

async function fetchPage(cursor: string | null): Promise<CreditHistoryPage> {
  const qs = new URLSearchParams({ limit: String(PAGE_SIZE) });
  if (cursor) qs.set('cursor', cursor);
  const res = await fetch(`/api/credits/history?${qs}`, { credentials: 'include' });
  if (!res.ok) throw new Error('history');
  return res.json() as Promise<CreditHistoryPage>;
}

const KNOWN_TYPES = ['SIGNUP_BONUS', 'ADMIN_GRANT', 'ANALYSIS_SPEND', 'ANALYSIS_FREE', 'PURCHASE', 'REFUND'];

function Row({ item, locale }: { item: CreditHistoryItem; locale: string }) {
  const { t } = useTranslation('profile');
  const date = new Date(item.createdAt).toLocaleString(locale === 'en' ? 'en-GB' : 'tr-TR', { dateStyle: 'medium', timeStyle: 'short' });
  const typeLabel = KNOWN_TYPES.includes(item.type) ? t(`history.types.${item.type}`) : item.type;
  const sign = item.amount > 0 ? '+' : item.amount < 0 ? '−' : '';
  const tone = item.amount > 0 ? styles.histPlus : item.amount < 0 ? styles.histMinus : styles.histZero;
  return (
    <li className={styles.histRow}>
      <div className={styles.histMain}>
        <span className={styles.histType}>{typeLabel}</span>
        {item.matchLabel ? (
          <Link href={`/matches/${item.matchId}`} className={styles.histMatch}>{item.matchLabel}</Link>
        ) : null}
        {item.note ? <span className={styles.histNote}>{item.note}</span> : null}
        <time className={styles.histDate} dateTime={item.createdAt}>{date}</time>
      </div>
      <div className={styles.histNums}>
        <span className={`${styles.histAmount} ${tone}`}>{sign}{Math.abs(item.amount)}</span>
        <span className={styles.histBalance}>{t('history.balanceAfter', { balance: item.balanceAfter })}</span>
      </div>
    </li>
  );
}

/** "Kredi Geçmişi": CreditTransaction defteri, en yeniden eskiye, 20'şer lazy-load. */
export default function CreditHistoryTab() {
  const { t } = useTranslation('profile');
  const { locale } = useI18n();
  const q = useInfiniteQuery({
    queryKey: ['credit-history'],
    queryFn: ({ pageParam }) => fetchPage(pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    staleTime: 30_000,
  });
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>{t('tabs.credits')}</h2>
      {q.isLoading ? <p className={styles.hint}>{t('loading')}</p> : null}
      {q.isError ? <p className={`${styles.message} ${styles.err}`}>{t('history.error')}</p> : null}
      {!q.isLoading && !q.isError && items.length === 0 ? <p className={styles.hint}>{t('history.empty')}</p> : null}
      {items.length > 0 ? (
        <ul className={styles.histList}>
          {items.map((it) => (
            <Row key={it.id} item={it} locale={locale} />
          ))}
        </ul>
      ) : null}
      {q.hasNextPage ? (
        <button type="button" className={styles.moreBtn} onClick={() => void q.fetchNextPage()} disabled={q.isFetchingNextPage}>
          {q.isFetchingNextPage ? t('loading') : t('history.more')}
        </button>
      ) : null}
    </section>
  );
}
