import Link from 'next/link';
import Avatar from '@/components/Avatar';
import LikeButton from '@/components/LikeButton';
import MoreButton from '@/components/Moderation/MoreButton';
import PostMatchBadge from '@/components/PostMatchBadge';
import CommentIcon from '@/components/icons/CommentIcon';
import TrashIcon from '@/components/icons/TrashIcon';
import VerifiedIcon from '@/components/icons/VerifiedIcon';
import { useTranslation } from '@/lib/i18n';
import { isModifiedClick } from '@/utils/matchSelection';
import { formatRelativeTime } from '@/utils/relativeTime';
import { splitMentions } from '@/utils/mentions';
import type { GundemMention, GundemPost } from '@/types/gundem';
import styles from './postCard.module.scss';

export type PostCardProps = {
  post: GundemPost;
  /** Oturum açık kullanıcı (yoksa null): beğeni pasif, silme gizli. */
  currentUserId?: string | null;
  isAdmin?: boolean;
  selected?: boolean;
  liking?: boolean;
  deleting?: boolean;
  /** Avatar + isim yazarın profil sayfasına bağlanır (`/gundem/kullanici/[id]`). Profil sayfasının kendisinde kapatılır. */
  linkAuthor?: boolean;
  /** Maç postunda maç rozeti (varsayılan açık). Maç sayfasının forumunda gereksiz → kapatılır. */
  showMatchBadge?: boolean;
  /** Yorumlar/detay aç (split panel ya da tam sayfa) — yoksa yorum düğmesi ve zaman bağlantısı yalnızca bağlantı olur. */
  onOpen?: (postId: string) => void;
  onToggleLike: (postId: string) => void;
  onDelete?: (postId: string) => void;
  /** Yalnızca test: göreli zaman için sabit "şimdi". */
  now?: number;
};

/** Gövde: doğrulanmış @etiketler profil bağlantısı, gerisi düz metin (gönderi ve yorum aynı kuralı kullanır). */
export function MentionText({ body, mentions, linkClassName }: { body: string; mentions?: GundemMention[]; linkClassName?: string }) {
  return (
    <>
      {splitMentions(body, mentions).map((part, i) =>
        'text' in part ? (
          part.text
        ) : (
          <Link key={i} href={`/gundem/kullanici/${part.userId}`} className={linkClassName}>
            @{part.handle}
          </Link>
        ),
      )}
    </>
  );
}

/**
 * Tek gönderi kartı: Avatar + isim (resmi rozet) + göreli zaman + gövde (satır sonları korunur) + beğeni/yorum/sil.
 * Başkasının gönderisinde "⋯" (şikâyet / engelle; menü tembel yüklenir). Moderasyonla gizlenmiş kendi gönderinde not.
 */
export default function PostCard({
  post,
  currentUserId = null,
  isAdmin = false,
  selected = false,
  liking = false,
  deleting = false,
  linkAuthor = true,
  showMatchBadge = true,
  onOpen,
  onToggleLike,
  onDelete,
  now,
}: PostCardProps) {
  const { t } = useTranslation('gundem');
  const official = post.authorType === 'OFFICIAL_BOT' || post.author.official;
  const deletedAuthor = post.author.deleted === true;
  const displayName = deletedAuthor ? t('post.deletedUser') : (post.author.name ?? post.author.username ?? t('post.anonymous'));
  // Silinmiş kullanıcının profili yok → bağlantı verilmez.
  const authorLinked = linkAuthor && !deletedAuthor;
  const canDelete = !!onDelete && !!currentUserId && (post.author.id === currentUserId || isAdmin);
  // Şikâyet / engelleme: oturum açık ve başkasının gönderisi. Silinmiş kullanıcı ve resmi hesap engellenmez (yalnız şikâyet).
  const canModerate = !!currentUserId && post.author.id !== currentUserId;
  const href = `/gundem/${post.id}`;
  const profileHref = `/gundem/kullanici/${post.author.id}`;
  const avatar = <Avatar name={displayName} image={post.author.image} size={40} />;
  const nameContent = (
    <>
      {displayName}
      {official ? <VerifiedIcon className={styles.verified} size={15} title={t('post.official')} /> : null}
    </>
  );

  return (
    <article className={`${styles.card} ${selected ? styles.selected : ''}`.trim()} aria-current={selected || undefined}>
      <header className={styles.head}>
        {authorLinked ? (
          // Avatar bağlantısı klavye/ekran okuyucu için yinelenen durak olmasın: isim bağlantısı asıl bağlantıdır
          <Link href={profileHref} className={styles.avatarLink} tabIndex={-1} aria-hidden="true">
            {avatar}
          </Link>
        ) : (
          avatar
        )}
        <div className={styles.who}>
          {authorLinked ? (
            <Link href={profileHref} className={`${styles.name} ${styles.nameLink}`}>
              {nameContent}
            </Link>
          ) : (
            <span className={styles.name}>{nameContent}</span>
          )}
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
        {canModerate ? (
          <MoreButton
            label={t('post.more')}
            targetType="POST"
            targetId={post.id}
            blockTarget={deletedAuthor || official ? null : { id: post.author.id, name: displayName }}
          />
        ) : null}
      </header>

      {showMatchBadge && post.match ? <PostMatchBadge match={post.match} /> : null}

      {post.underReview ? (
        <p className={styles.review} role="note">
          {t('post.underReview')}
        </p>
      ) : null}

      <p className={styles.body}>
        <MentionText body={post.body} mentions={post.mentions} linkClassName={styles.mention} />
      </p>

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
