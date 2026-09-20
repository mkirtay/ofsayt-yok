import Head from 'next/head';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { useCallback, useEffect, useRef } from 'react';
import EmptyState from '@/components/EmptyState';
import PostCard from '@/components/PostCard';
import PostComposer from '@/components/PostComposer';
import PostDetailPanel from '@/components/PostDetailPanel';
import { POST_MAX_LENGTH } from '@/config/gundem';
import { useCreatePost, useGundemFeed } from '@/hooks/useGundem';
import { usePostActions } from '@/hooks/usePostActions';
import { useInfiniteSentinel } from '@/hooks/useInfiniteSentinel';
import { useSplitView } from '@/hooks/useSplitView';
import { useTranslation } from '@/lib/i18n';
import type { GundemScope } from '@/types/gundem';
import { buildPostSelectionTarget, readSelectedPostId } from '@/utils/postSelection';
import styles from './gundemHubPage.module.scss';

const SCOPES: GundemScope[] = ['all', 'following', 'official'];

function readScope(raw: string | string[] | undefined): GundemScope {
  const s = Array.isArray(raw) ? raw[0] : raw;
  return SCOPES.includes(s as GundemScope) ? (s as GundemScope) : 'all';
}

/**
 * Gündem hub'ı: scope sekmeleri + composer + akış; geniş ekranda (≥ $bp-split) seçili post'un yorumları sağ panelde.
 * Split-view mekanizması MatchHubPage ile aynı: `?post=<id>` (query), shallow `router.push`, `useSplitView`,
 * dar ekranda `/gundem/[postId]` tam sayfasına düşme. (MatchHubPage'in kendisi kopyalanmadı.)
 */
export default function GundemHubPage() {
  const router = useRouter();
  const { t } = useTranslation('gundem');
  const { status } = useSession();
  const authenticated = status === 'authenticated';
  // Oturum çözülene kadar (`loading`) "giriş yap" istemi/sekme değişimi gösterme — yalnızca kesin oturumsuzsa (`unauthenticated`)
  const unauthenticated = status === 'unauthenticated';
  const splitView = useSplitView();
  const isSplit = splitView === true;

  // Oturumsuzken "Takip" sekmesi anlamsız → Tümü'ne düşer
  const requested = readScope(router.query.scope);
  const scope: GundemScope = requested === 'following' && unauthenticated ? 'all' : requested;
  const selectedPostId = readSelectedPostId(router.query);
  const showPanel = isSplit && selectedPostId != null;

  const feed = useGundemFeed(scope);
  const createPost = useCreatePost();
  const actions = usePostActions();
  const items = feed.data?.pages.flatMap((p) => p.items) ?? [];

  const queryRef = useRef(router.query);
  useEffect(() => {
    queryRef.current = router.query;
  }, [router.query]);

  const handleSelect = useCallback(
    (postId: string) => {
      if (!isSplit) {
        void router.push(`/gundem/${postId}`);
        return;
      }
      if (postId === readSelectedPostId(queryRef.current)) return;
      // Her seçim bir geçmiş kaydı: tarayıcı geri/ileri tuşu seçimi geri alır/yineler.
      void router.push(buildPostSelectionTarget(router.pathname, queryRef.current, postId), undefined, {
        shallow: true,
        scroll: false,
      });
    },
    [isSplit, router],
  );

  const handleClose = useCallback(() => {
    void router.push(buildPostSelectionTarget(router.pathname, queryRef.current, null), undefined, {
      shallow: true,
      scroll: false,
    });
  }, [router]);

  // Paylaşılan `/gundem?post=…` linki dar ekranda (split yok) → tam sayfa
  useEffect(() => {
    if (!router.isReady || splitView !== false || !selectedPostId) return;
    void router.replace(`/gundem/${selectedPostId}`);
  }, [router, splitView, selectedPostId]);

  function selectScope(next: GundemScope) {
    const { scope: _drop, ...rest } = queryRef.current;
    void _drop;
    void router.replace(
      { pathname: router.pathname, query: next === 'all' ? rest : { ...rest, scope: next } },
      undefined,
      { shallow: true, scroll: false },
    );
  }

  // Sonsuz kaydırma: alttaki gözcü görününce sonraki sayfa; "Daha fazla yükle" düğmesi yedek
  const sentinelRef = useInfiniteSentinel(feed, items.length);

  const tabs: GundemScope[] = unauthenticated ? SCOPES.filter((s) => s !== 'following') : SCOPES;

  return (
    <>
      <Head>
        <title>{t('meta.title')}</title>
        <meta name="description" content={t('meta.description')} />
        <meta property="og:title" content={t('meta.title')} />
        <meta property="og:description" content={t('meta.description')} />
        <link rel="canonical" href={`${process.env.AUTH_URL ?? 'https://ofsaytyok.app'}/gundem`} />
      </Head>
      <div className={styles.shell}>
        <div className={styles.top}>
          <h1 className={styles.title}>{t('title')}</h1>
          <div className={styles.tabs} role="tablist" aria-label={t('tabs.label')}>
            {tabs.map((s) => (
              <button
                key={s}
                type="button"
                role="tab"
                aria-selected={scope === s}
                className={`${styles.tab} ${scope === s ? styles.tabActive : ''}`.trim()}
                onClick={() => selectScope(s)}
              >
                {t(`tabs.${s}`)}
              </button>
            ))}
          </div>
        </div>

        <div className={`${styles.grid} ${isSplit ? styles.gridSplit : ''}`.trim()}>
          <section className={styles.feed} aria-busy={feed.isPending}>
            {status === 'loading' ? null : (
              <PostComposer
                variant="post"
                authenticated={authenticated}
                maxLength={POST_MAX_LENGTH}
                onSubmit={(body) => createPost.mutateAsync({ body })}
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
              <EmptyState>{t(`feed.empty.${scope}`)}</EmptyState>
            ) : (
              <ul className={styles.list}>
                {items.map((post) => (
                  <li key={post.id}>
                    <PostCard
                      post={post}
                      currentUserId={actions.currentUserId}
                      isAdmin={actions.isAdmin}
                      selected={showPanel && post.id === selectedPostId}
                      liking={actions.likingId === post.id}
                      deleting={actions.deletingId === post.id}
                      onOpen={handleSelect}
                      onToggleLike={actions.toggleLike}
                      onDelete={(id) => actions.remove(id, id === selectedPostId ? handleClose : undefined)}
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

          {isSplit ? (
            <aside className={styles.side}>
              {selectedPostId ? (
                <PostDetailPanel postId={selectedPostId} variant="panel" onClose={handleClose} onDeleted={handleClose} />
              ) : (
                <EmptyState>{t('detail.selectHint')}</EmptyState>
              )}
            </aside>
          ) : null}
        </div>
      </div>
      {actions.confirmDialog}
    </>
  );
}
