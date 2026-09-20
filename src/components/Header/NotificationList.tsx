import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import Avatar from '@/components/Avatar';
import { useMarkNotificationsRead, useNotifications, useUnreadCount } from '@/hooks/useGundem';
import { useTranslation } from '@/lib/i18n';
import { describeNotification } from '@/utils/notifications';
import { formatRelativeTime } from '@/utils/relativeTime';
import styles from './notifications.module.scss';

/**
 * Bildirim paneli içeriği. Panel açılınca (bileşen mount olunca) yüklenen sayfadaki okunmamışlar otomatik okundu işaretlenir;
 * o oturumda hâlâ "yeni" görünsünler diye kimlikleri yerelde tutulur (nokta paneli kapatana kadar kalır).
 * Yüklü sayfaların dışında kalan okunmamışlar için "Tümünü okundu işaretle" düğmesi gösterilir.
 */
export default function NotificationList({ onNavigate }: { onNavigate: () => void }) {
  const { t } = useTranslation('gundem');
  const list = useNotifications(true);
  const { data: unreadCount = 0 } = useUnreadCount();
  const mark = useMarkNotificationsRead();
  const { mutate } = mark;
  const sentRef = useRef<Set<string>>(new Set());
  const [fresh, setFresh] = useState<ReadonlySet<string>>(new Set());

  const items = useMemo(() => list.data?.pages.flatMap((p) => p.items) ?? [], [list.data]);

  useEffect(() => {
    const ids = items.filter((n) => !n.readAt && !sentRef.current.has(n.id)).map((n) => n.id);
    if (ids.length === 0) return;
    ids.forEach((id) => sentRef.current.add(id));
    setFresh((prev) => new Set([...prev, ...ids]));
    mutate(ids);
  }, [items, mutate]);

  const rows = items.flatMap((n) => {
    const view = describeNotification(n, t);
    return view ? [{ n, view }] : []; // bilinmeyen tür: atla
  });

  return (
    <div className={styles.root}>
      <div className={styles.head}>
        <span className={styles.title}>{t('notifications.title')}</span>
        {unreadCount > 0 ? (
          <button type="button" className={styles.markAll} onClick={() => mutate(undefined)} disabled={mark.isPending}>
            {t('notifications.markAllRead')}
          </button>
        ) : null}
      </div>

      {list.isPending ? (
        <p className={styles.state}>{t('notifications.loading')}</p>
      ) : list.isError ? (
        <p className={styles.state}>
          {t('notifications.error')}{' '}
          <button type="button" className={styles.markAll} onClick={() => void list.refetch()}>
            {t('feed.retry')}
          </button>
        </p>
      ) : rows.length === 0 ? (
        <p className={styles.state}>{t('notifications.empty')}</p>
      ) : (
        <ul className={styles.list}>
          {rows.map(({ n, view }) => {
            const isNew = fresh.has(n.id);
            const body = (
              <>
                <Avatar name={n.actor?.name ?? n.actor?.username} image={n.actor?.image} size={36} />
                <span className={styles.content}>
                  <span className={styles.text}>{view.text}</span>
                  {view.snippet ? <span className={styles.snippet}>{view.snippet}</span> : null}
                  <time className={styles.time} dateTime={n.createdAt}>
                    {formatRelativeTime(n.createdAt, t)}
                  </time>
                </span>
                {isNew ? <span className={styles.dot} role="img" aria-label={t('notifications.unreadDot')} /> : null}
              </>
            );
            const cls = [styles.item, isNew ? styles.itemNew : '', view.muted ? styles.itemMuted : ''].filter(Boolean).join(' ');
            return (
              <li key={n.id}>
                {view.href ? (
                  <Link href={view.href} className={cls} onClick={onNavigate}>
                    {body}
                  </Link>
                ) : (
                  <div className={cls}>{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {list.hasNextPage ? (
        <button type="button" className={styles.more} onClick={() => void list.fetchNextPage()} disabled={list.isFetchingNextPage}>
          {list.isFetchingNextPage ? t('notifications.loading') : t('notifications.loadMore')}
        </button>
      ) : null}
    </div>
  );
}
