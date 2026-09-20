import Avatar from '@/components/Avatar';
import { useConfirmDialog } from '@/components/ConfirmDialog';
import EmptyState from '@/components/EmptyState';
import PostComposer from '@/components/PostComposer';
import TrashIcon from '@/components/icons/TrashIcon';
import { COMMENT_MAX_LENGTH } from '@/config/gundem';
import { useCreateComment, useDeleteComment, useGundemComments } from '@/hooks/useGundem';
import { useTranslation } from '@/lib/i18n';
import { formatRelativeTime } from '@/utils/relativeTime';
import styles from './postComments.module.scss';

type Props = {
  postId: string;
  currentUserId: string | null;
  isAdmin: boolean;
};

/** Post altı yorumlar: yazma alanı + cursor sayfalamalı liste + silme (sahip/ADMIN). Yorum beğenisi yok. */
export default function PostComments({ postId, currentUserId, isAdmin }: Props) {
  const { t } = useTranslation('gundem');
  const comments = useGundemComments(postId);
  const create = useCreateComment(postId);
  const remove = useDeleteComment(postId);
  const { ask, dialog } = useConfirmDialog();
  const items = comments.data?.pages.flatMap((p) => p.items) ?? [];

  function onDelete(commentId: string) {
    if (remove.isPending) return;
    ask({
      title: t('comments.deleteTitle'),
      message: t('comments.confirmDelete'),
      confirmLabel: t('common:dialog.delete'),
      cancelLabel: t('common:dialog.cancel'),
      errorMessage: t('comments.deleteError'),
      onConfirm: () => remove.mutateAsync(commentId),
    });
  }

  return (
    <section className={styles.section} aria-label={t('comments.title')}>
      <h2 className={styles.title}>{t('comments.title')}</h2>

      <PostComposer
        variant="comment"
        authenticated={!!currentUserId}
        maxLength={COMMENT_MAX_LENGTH}
        onSubmit={(body) => create.mutateAsync(body)}
      />

      {comments.isLoading ? (
        <EmptyState>{t('comments.loading')}</EmptyState>
      ) : comments.isError ? (
        <EmptyState>{t('comments.error')}</EmptyState>
      ) : items.length === 0 ? (
        <EmptyState>{t('comments.empty')}</EmptyState>
      ) : (
        <ul className={styles.list}>
          {items.map((c) => {
            const name = c.user.name ?? c.user.username ?? t('post.anonymous');
            const canDelete = !!currentUserId && (c.user.id === currentUserId || isAdmin);
            return (
              <li key={c.id} className={styles.item}>
                <Avatar name={name} image={c.user.image} size={32} />
                <div className={styles.main}>
                  <div className={styles.head}>
                    <span className={styles.name}>{name}</span>
                    <time className={styles.time} dateTime={c.createdAt}>
                      {formatRelativeTime(c.createdAt, t)}
                    </time>
                  </div>
                  <p className={styles.text}>{c.body}</p>
                </div>
                {canDelete ? (
                  <button
                    type="button"
                    className={styles.delete}
                    onClick={() => onDelete(c.id)}
                    disabled={remove.isPending && remove.variables === c.id}
                    aria-label={t('comments.delete')}
                    title={t('comments.delete')}
                  >
                    <TrashIcon size={15} />
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {comments.hasNextPage ? (
        <button
          type="button"
          className={styles.more}
          onClick={() => void comments.fetchNextPage()}
          disabled={comments.isFetchingNextPage}
        >
          {comments.isFetchingNextPage ? t('feed.loadingMore') : t('comments.loadMore')}
        </button>
      ) : null}
      {dialog}
    </section>
  );
}
