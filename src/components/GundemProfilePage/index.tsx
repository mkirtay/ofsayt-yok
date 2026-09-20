import Link from 'next/link';
import Avatar from '@/components/Avatar';
import EmptyState from '@/components/EmptyState';
import FollowButton from '@/components/FollowButton';
import VerifiedIcon from '@/components/icons/VerifiedIcon';
import PostCard from '@/components/PostCard';
import { GundemApiError, useGundemUser, useGundemUserPosts } from '@/hooks/useGundem';
import { useInfiniteSentinel } from '@/hooks/useInfiniteSentinel';
import { usePostActions } from '@/hooks/usePostActions';
import { useTranslation } from '@/lib/i18n';
import hub from '@/components/GundemHubPage/gundemHubPage.module.scss';
import styles from './gundemProfilePage.module.scss';

/**
 * Kullanıcı profili: başlık (avatar, isim, rozet, @kullanıcı, takipçi/takip sayıları, takip düğmesi) + o kullanıcının akışı.
 * Akış Hub ile aynı kalıbı kullanır (PostCard + `useInfiniteSentinel`); split-view yok — `onOpen` verilmediği için
 * kartlar `/gundem/[postId]` tam sayfasına düz bağlantıdır.
 */
export default function GundemProfilePage({ userId }: { userId: string }) {
  const { t } = useTranslation('gundem');
  const profile = useGundemUser(userId);
  const feed = useGundemUserPosts(userId);
  const actions = usePostActions();
  const items = feed.data?.pages.flatMap((p) => p.items) ?? [];
  const sentinelRef = useInfiniteSentinel(feed, items.length);

  const notFound = profile.error instanceof GundemApiError && profile.error.status === 404;
  const user = profile.data;
  const isSelf = !!actions.currentUserId && actions.currentUserId === userId;
  const displayName = user ? (user.name ?? user.username ?? t('post.anonymous')) : '';

  return (
    <>
      <div className={hub.shell}>
        <div className={hub.grid}>
          <Link href="/gundem" className={hub.inlineAction}>
            {t('detail.back')}
          </Link>

          {profile.isPending ? (
            <EmptyState>{t('feed.loading')}</EmptyState>
          ) : notFound ? (
            <EmptyState>{t('profile.notFound')}</EmptyState>
          ) : profile.isError || !user ? (
            <EmptyState>
              {t('profile.error')}{' '}
              <button type="button" className={hub.inlineAction} onClick={() => void profile.refetch()}>
                {t('feed.retry')}
              </button>
            </EmptyState>
          ) : (
            <>
              <header className={styles.header}>
                <Avatar name={displayName} image={user.image} size={80} />
                <div className={styles.info}>
                  <h1 className={styles.name}>
                    <span className={styles.nameText}>{displayName}</span>
                    {user.official ? <VerifiedIcon className={styles.verified} size={20} title={t('post.official')} /> : null}
                  </h1>
                  {user.username ? <span className={styles.username}>@{user.username}</span> : null}
                  <dl className={styles.stats}>
                    <div>
                      <dd>{user.followerCount}</dd>
                      <dt>{t('profile.followers')}</dt>
                    </div>
                    <div>
                      <dd>{user.followingCount}</dd>
                      <dt>{t('profile.following')}</dt>
                    </div>
                    <div>
                      <dd>{user.postCount}</dd>
                      <dt>{t('profile.posts')}</dt>
                    </div>
                  </dl>
                </div>
                <div className={styles.action}>
                  {isSelf ? (
                    <Link href="/profile" className={styles.editLink}>
                      {t('profile.edit')}
                    </Link>
                  ) : (
                    <FollowButton userId={user.id} following={user.followedByMe} />
                  )}
                </div>
              </header>

              <section className={hub.feed} aria-busy={feed.isPending}>
                {feed.isPending ? (
                  <EmptyState>{t('feed.loading')}</EmptyState>
                ) : feed.isError ? (
                  <EmptyState>
                    {t('feed.error')}{' '}
                    <button type="button" className={hub.inlineAction} onClick={() => void feed.refetch()}>
                      {t('feed.retry')}
                    </button>
                  </EmptyState>
                ) : items.length === 0 ? (
                  <EmptyState>{t('profile.empty')}</EmptyState>
                ) : (
                  <ul className={hub.list}>
                    {items.map((post) => (
                      <li key={post.id}>
                        <PostCard
                          post={post}
                          currentUserId={actions.currentUserId}
                          isAdmin={actions.isAdmin}
                          linkAuthor={false}
                          liking={actions.likingId === post.id}
                          deleting={actions.deletingId === post.id}
                          onToggleLike={actions.toggleLike}
                          onDelete={(id) => actions.remove(id)}
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
                      className={hub.more}
                      onClick={() => void feed.fetchNextPage()}
                      disabled={feed.isFetchingNextPage}
                    >
                      {feed.isFetchingNextPage ? t('feed.loadingMore') : t('feed.loadMore')}
                    </button>
                  </>
                ) : null}
              </section>
            </>
          )}
        </div>
      </div>
      {actions.confirmDialog}
    </>
  );
}
