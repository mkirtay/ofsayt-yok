import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import Avatar from '@/components/Avatar';
import { useToast } from '@/components/Toast';
import { fetchBlockedUsers, setUserBlocked } from '@/components/Moderation/api';
import { useI18n, useTranslation } from '@/lib/i18n';
import '@/lib/i18nNamespaces/moderation';
import mod from '@/components/Moderation/moderation.module.scss';
import styles from './profile.module.scss';

const BLOCKS_KEY = ['gundem', 'blocks'] as const;

/** Profil › Engellenenler: engellediğim kullanıcılar + "Engeli kaldır" (GET /api/gundem/blocks, DELETE …/block). */
export default function BlockedTab() {
  const { t } = useTranslation('moderation');
  const { locale } = useI18n();
  const qc = useQueryClient();
  const { show, toastNode } = useToast(t('toast.close'));
  const [pending, setPending] = useState<string | null>(null);
  const q = useInfiniteQuery({
    queryKey: BLOCKS_KEY,
    queryFn: ({ pageParam }) => fetchBlockedUsers(pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });
  const rows = q.data?.pages.flatMap((p) => p.items) ?? [];

  async function unblock(id: string, name: string) {
    setPending(id);
    try {
      await setUserBlocked(id, false);
      show('success', t('block.undone', { name }));
      await qc.invalidateQueries({ queryKey: ['gundem'] });
    } catch {
      show('error', t('block.error'));
    } finally {
      setPending(null);
    }
  }

  return (
    <section className={styles.section} aria-labelledby="blocked-title">
      <h2 id="blocked-title" className={styles.sectionTitle}>
        {t('blocked.title')}
      </h2>
      <p className={styles.hint}>{t('blocked.intro')}</p>
      {q.isPending ? (
        <p className={styles.hint}>{t('blocked.loading')}</p>
      ) : q.isError ? (
        <p className={`${styles.message} ${styles.err}`}>{t('blocked.error')}</p>
      ) : rows.length === 0 ? (
        <p className={styles.hint}>{t('blocked.empty')}</p>
      ) : (
        <ul className={mod.blockedList}>
          {rows.map(({ user, blockedAt }) => {
            const name = user.name ?? user.username ?? user.id;
            const date = new Date(blockedAt).toLocaleDateString(locale === 'en' ? 'en-GB' : 'tr-TR', { timeZone: 'Europe/Istanbul' });
            return (
              <li key={user.id} className={mod.blockedRow}>
                <Avatar name={name} image={user.image} size={36} />
                <span className={mod.blockedWho}>
                  <Link href={`/gundem/kullanici/${user.id}`}>{user.username ? `@${user.username}` : name}</Link>
                  <span className={mod.blockedMeta}>{t('blocked.since', { date })}</span>
                </span>
                <button type="button" className={mod.ghost} disabled={pending === user.id} onClick={() => void unblock(user.id, name)}>
                  {t('blocked.unblock')}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {q.hasNextPage ? (
        <button type="button" className={mod.ghost} onClick={() => void q.fetchNextPage()} disabled={q.isFetchingNextPage}>
          {t('blocked.loadMore')}
        </button>
      ) : null}
      {toastNode}
    </section>
  );
}
