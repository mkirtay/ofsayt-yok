import { useEffect, useRef } from 'react';
import Link from 'next/link';
import EmptyState from '@/components/EmptyState';
import PostCard from '@/components/PostCard';
import PostComments from '@/components/PostComments';
import { GundemApiError, useGundemPost } from '@/hooks/useGundem';
import { usePostActions } from '@/hooks/usePostActions';
import { useTranslation } from '@/lib/i18n';
import styles from './postDetailPanel.module.scss';

type Props = {
  postId: string;
  /** `panel`: split-view sağ paneli (üst çubuk + Esc ile kapanır). `page`: tam sayfa gövdesi. */
  variant: 'panel' | 'page';
  /** Panel kapatma (yalnızca `panel`). */
  onClose?: () => void;
  /** Post silindikten sonra (panel kapanır / sayfa /gundem'e döner). */
  onDeleted?: () => void;
};

/** Post + yorumları: split-view paneli ve `/gundem/[postId]` tam sayfası AYNI içeriği kullanır. */
export default function PostDetailPanel({ postId, variant, onClose, onDeleted }: Props) {
  const { t } = useTranslation('gundem');
  const post = useGundemPost(postId);
  const actions = usePostActions();
  const scrollRef = useRef<HTMLDivElement>(null);
  const isPanel = variant === 'panel';

  // Yeni post seçilince panel başa dönsün
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [postId]);

  useEffect(() => {
    if (!isPanel || !onClose) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      const el = e.target as HTMLElement | null;
      if (el && ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) return;
      onClose?.();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isPanel, onClose]);

  const notFound = post.isError && post.error instanceof GundemApiError && post.error.status === 404;

  const content = post.isPending && !post.isError ? (
    <EmptyState>{t('feed.loading')}</EmptyState>
  ) : notFound ? (
    <EmptyState>{t('detail.notFound')}</EmptyState>
  ) : post.isError || !post.data ? (
    <EmptyState>{t('feed.error')}</EmptyState>
  ) : (
    <>
      <PostCard
        post={post.data}
        currentUserId={actions.currentUserId}
        isAdmin={actions.isAdmin}
        liking={actions.likingId === post.data.id}
        deleting={actions.deletingId === post.data.id}
        onToggleLike={actions.toggleLike}
        onDelete={(id) => actions.remove(id, onDeleted)}
      />
      <PostComments postId={post.data.id} currentUserId={actions.currentUserId} isAdmin={actions.isAdmin} />
    </>
  );

  if (!isPanel) {
    return (
      <div className={styles.page}>
        {content}
        {actions.confirmDialog}
      </div>
    );
  }

  return (
    <section className={styles.panel} aria-label={t('detail.panelLabel')}>
      <header className={styles.bar}>
        <span className={styles.barTitle}>{t('detail.barTitle')}</span>
        <div className={styles.barActions}>
          <Link href={`/gundem/${postId}`} className={styles.fullLink}>
            {t('detail.fullPage')}
          </Link>
          <button type="button" className={styles.close} onClick={onClose} aria-label={t('detail.close')}>
            ✕
          </button>
        </div>
      </header>
      <div className={styles.scroll} ref={scrollRef}>
        {content}
      </div>
      {actions.confirmDialog}
    </section>
  );
}
