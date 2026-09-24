import { useSession } from 'next-auth/react';
import EmptyState from '@/components/EmptyState';
import PostCard from '@/components/PostCard';
import PostComposer from '@/components/PostComposer';
import { POST_MAX_LENGTH } from '@/config/gundem';
import { useCreatePost, useGundemFeed } from '@/hooks/useGundem';
import { useInfiniteSentinel } from '@/hooks/useInfiniteSentinel';
import { usePostActions } from '@/hooks/usePostActions';
import { useTranslation } from '@/lib/i18n';
import type { GundemScope } from '@/types/gundem';
import styles from './gundemPanel.module.scss';

export type GundemPanelProps = {
  scope: GundemScope;
  /** Composer: `none` gizler; `post` tam form; `post-inline` tek satır → odakta genişler. */
  composer?: 'none' | 'post' | 'post-inline';
  /** Bir gönderiye tıklanınca (`PostCard.onOpen`): /gundem'de split-view seçimi, ileride ana sayfada tam navigasyon. */
  onOpenPost: (postId: string) => void;
  /** Vurgulanacak (paneli açık) gönderi; yoksa `null`. */
  selectedPostId?: string | null;
  /** Silinen gönderi `selectedPostId` ise çağrılır (ör. detay panelini kapat). */
  onSelectedPostDeleted?: () => void;
  /** `false` → akış çekilmez (altyapı: ana sayfada yalnızca gerektiğinde). Varsayılan `true`. */
  enabled?: boolean;
  /** Akış sorgusunun `staleTime`'ı (ms); verilmezse hook varsayılanı (30 sn). */
  staleTime?: number;
  /**
   * Maç forumu: yalnızca bu maçın postları; composer'dan yazılan post otomatik bu `matchId`'yi alır ve kartlarda maç
   * rozeti gösterilmez (zaten maç sayfasındayız). `scope` yok sayılır.
   */
  matchId?: string | null;
  /** Composer yer tutucusu (varsayılan: Gündem metni). */
  composerPlaceholder?: string;
  /** Boş akış metni (varsayılan: `feed.empty.<scope>`). */
  emptyText?: string;
};

/** Gündem akışı: (isteğe bağlı) composer + PostCard listesi + sonsuz kaydırma. Konumlandırmayı çağıran yapar. */
export default function GundemPanel({
  scope,
  composer = 'post',
  onOpenPost,
  selectedPostId = null,
  onSelectedPostDeleted,
  enabled = true,
  staleTime,
  matchId = null,
  composerPlaceholder,
  emptyText,
}: GundemPanelProps) {
  const { t } = useTranslation('gundem');
  const { status } = useSession();
  const authenticated = status === 'authenticated';

  const feed = useGundemFeed(scope, { enabled, staleTime, matchId });
  const createPost = useCreatePost();
  const actions = usePostActions();
  const items = feed.data?.pages.flatMap((p) => p.items) ?? [];

  // Sonsuz kaydırma: alttaki gözcü görününce sonraki sayfa; "Daha fazla yükle" düğmesi yedek
  const sentinelRef = useInfiniteSentinel(feed, items.length);

  return (
    <>
      <section className={styles.feed} aria-busy={feed.isPending}>
        {composer === 'none' || status === 'loading' ? null : (
          <PostComposer
            variant={composer}
            authenticated={authenticated}
            maxLength={POST_MAX_LENGTH}
            placeholder={composerPlaceholder}
            onSubmit={(body) => createPost.mutateAsync(matchId ? { body, matchId } : { body })}
          />
        )}

        {/* isPending: oturum çözülene kadar sorgu devre dışıdır — o sürede "boş" değil "yükleniyor" gösterilir */}
        {feed.isPending ? (
          <EmptyState>{t('feed.loading')}</EmptyState>
        ) : feed.isError ? (
          <EmptyState>
            {t('feed.error')}{' '}
            <button type="button" className={styles.inlineAction} onClick={() => void feed.refetch()}>
              {t('feed.retry')}
            </button>
          </EmptyState>
        ) : items.length === 0 ? (
          <EmptyState>{emptyText ?? t(`feed.empty.${scope}`)}</EmptyState>
        ) : (
          <ul className={styles.list}>
            {items.map((post) => (
              <li key={post.id}>
                <PostCard
                  post={post}
                  currentUserId={actions.currentUserId}
                  isAdmin={actions.isAdmin}
                  selected={post.id === selectedPostId}
                  showMatchBadge={!matchId}
                  liking={actions.likingId === post.id}
                  deleting={actions.deletingId === post.id}
                  onOpen={onOpenPost}
                  onToggleLike={actions.toggleLike}
                  onDelete={(id) => actions.remove(id, id === selectedPostId ? onSelectedPostDeleted : undefined)}
                />
              </li>
            ))}
          </ul>
        )}

        {feed.hasNextPage ? (
          <>
            <div ref={sentinelRef} aria-hidden="true" />
            <button
              type="button"
              className={styles.more}
              onClick={() => void feed.fetchNextPage()}
              disabled={feed.isFetchingNextPage}
            >
              {feed.isFetchingNextPage ? t('feed.loadingMore') : t('feed.loadMore')}
            </button>
          </>
        ) : null}
      </section>
      {actions.confirmDialog}
    </>
  );
}
