import Link from 'next/link';
import Avatar from '@/components/Avatar';
import LikeButton from '@/components/LikeButton';
import CommentIcon from '@/components/icons/CommentIcon';
import TrashIcon from '@/components/icons/TrashIcon';
import VerifiedIcon from '@/components/icons/VerifiedIcon';
import { useTranslation } from '@/lib/i18n';
import { isModifiedClick } from '@/utils/matchSelection';
import { formatRelativeTime } from '@/utils/relativeTime';
import type { GundemPost } from '@/types/gundem';
import styles from './postCard.module.scss';

export type PostCardProps = {
  post: GundemPost;
  /** Oturum açık kullanıcı (yoksa null): beğeni pasif, silme gizli. */
  currentUserId?: string | null;
  isAdmin?: boolean;
  selected?: boolean;
  liking?: boolean;
  deleting?: boolean;
  /** Yorumlar/detay aç (split panel ya da tam sayfa) — yoksa yorum düğmesi ve zaman bağlantısı yalnızca bağlantı olur. */
  onOpen?: (postId: string) => void;
  onToggleLike: (postId: string) => void;
  onDelete?: (postId: string) => void;
  /** Yalnızca test: göreli zaman için sabit "şimdi". */
  now?: number;
};

/** Tek gönderi kartı: Avatar + isim (resmi rozet) + göreli zaman + gövde (satır sonları korunur) + beğeni/yorum/sil. */
export default function PostCard({
  post,
  currentUserId = null,
  isAdmin = false,
  selected = false,
  liking = false,
  deleting = false,
  onOpen,
  onToggleLike,
  onDelete,
  now,
}: PostCardProps) {
  const { t } = useTranslation('gundem');
  const official = post.authorType === 'OFFICIAL_BOT';
  const displayName = post.author.name ?? post.author.username ?? t('post.anonymous');
  const canDelete = !!onDelete && !!currentUserId && (post.author.id === currentUserId || isAdmin);
  const href = `/gundem/${post.id}`;

  return (
    <article className={`${styles.card} ${selected ? styles.selected : ''}`.trim()} aria-current={selected || undefined}>
      <header className={styles.head}>
        <Avatar name={displayName} image={post.author.image} size={40} />
        <div className={styles.who}>
          <span className={styles.name}>
            {displayName}
            {official ? <VerifiedIcon className={styles.verified} size={15} title={t('post.official')} /> : null}
          </span>
          <span className={styles.meta}>
            {post.author.username ? <span>@{post.author.username}</span> : null}
            <Link
              href={href}
              className={styles.time}
              title={t('post.open')}
              onClick={(e) => {
                if (!onOpen || isModifiedClick(e.nativeEvent)) return;
                e.preventDefault();
                onOpen(post.id);
              }}
            >
              <time dateTime={post.createdAt}>{formatRelativeTime(post.createdAt, t, now)}</time>
            </Link>
          </span>
        </div>
        {canDelete ? (
          <button
            type="button"
            className={styles.delete}
            onClick={() => onDelete?.(post.id)}
            disabled={deleting}
            aria-label={deleting ? t('post.deleting') : t('post.delete')}
            title={t('post.delete')}
          >
            <TrashIcon />
          </button>
        ) : null}
      </header>

      <p className={styles.body}>{post.body}</p>

      <footer className={styles.actions}>
        <LikeButton
          liked={post.likedByMe}
          count={post.likes}
          onToggle={() => onToggleLike(post.id)}
          disabled={!currentUserId || liking}
          label={t('post.like')}
          title={currentUserId ? t('post.like') : t('post.loginToLike')}
        />
        <Link
          href={href}
          className={styles.commentBtn}
          aria-label={`${t('post.comments')}: ${post.comments}`}
          onClick={(e) => {
            if (!onOpen || isModifiedClick(e.nativeEvent)) return;
            e.preventDefault();
            onOpen(post.id);
          }}
        >
          <CommentIcon />
          <span className={styles.count}>{post.comments}</span>
        </Link>
      </footer>
    </article>
  );
}
