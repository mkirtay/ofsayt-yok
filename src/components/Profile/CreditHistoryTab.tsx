import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useCredits } from '@/hooks/useCredits';
import { useI18n, useTranslation } from '@/lib/i18n';
import '@/lib/i18nNamespaces/profile';
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

const KNOWN_TYPES = [
  'SIGNUP_BONUS',
  'ADMIN_GRANT',
  'ANALYSIS_SPEND',
  'ANALYSIS_FREE',
  'ANALYSIS_PREMIUM',
  'ANALYSIS_WEEKLY_FREE',
  'REFERRAL_BONUS',
  'PURCHASE',
  'REFUND',
  'COUPON',
];

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

/** Kupon kodu girişi: başarılı olunca bakiye ve geçmiş tazelenir. Hata metni sunucudan (Türkçe) gelir. */
function CouponForm() {
  const { t } = useTranslation('profile');
  const qc = useQueryClient();
  const { apply } = useCredits();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || !code.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/credits/redeem', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const body = (await res.json().catch(() => ({}))) as { added?: number; credits?: number; error?: string };
      if (res.ok && typeof body.added === 'number') {
        if (typeof body.credits === 'number') apply(body.credits);
        setMsg({ ok: true, text: t('history.coupon.success', { count: body.added }) });
        setCode('');
        void qc.invalidateQueries({ queryKey: ['credit-history'] });
      } else {
        setMsg({ ok: false, text: body.error ?? t('history.coupon.error') });
      }
    } catch {
      setMsg({ ok: false, text: t('history.coupon.error') });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className={styles.couponForm} onSubmit={submit}>
      <label className={styles.couponLabel} htmlFor="coupon-code">{t('history.coupon.title')}</label>
      <div className={styles.couponRow}>
        <input
          id="coupon-code"
          className={styles.input}
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder={t('history.coupon.placeholder')}
          maxLength={32}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
        />
        <button type="submit" className={styles.couponBtn} disabled={busy || !code.trim()}>
          {busy ? t('history.coupon.applying') : t('history.coupon.apply')}
        </button>
      </div>
      {msg ? (
        <p role="status" className={`${styles.message} ${msg.ok ? '' : styles.err}`}>{msg.text}</p>
      ) : null}
    </form>
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
      <CouponForm />
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
