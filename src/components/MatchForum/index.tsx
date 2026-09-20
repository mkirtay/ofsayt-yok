import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useTranslation } from '@/lib/i18n';
import { Role } from '@prisma/client';
import Link from 'next/link';
import Avatar from '@/components/Avatar';
import { useConfirmDialog } from '@/components/ConfirmDialog';
import EmptyState from '@/components/EmptyState';
import LikeButton from '@/components/LikeButton';
import TrashIcon from '@/components/icons/TrashIcon';
import { formatRelativeTime } from '@/utils/relativeTime';
import styles from './matchForum.module.scss';

interface Comment {
  id: string;
  body: string;
  createdAt: string;
  user: { id: string; name: string | null; image: string | null };
  likes?: number;
  likedByMe?: boolean;
}

interface MatchForumProps {
  matchId: string;
}

export default function MatchForum({ matchId }: MatchForumProps) {
  const { data: session } = useSession();
  const { t } = useTranslation('match');
  const [comments, setComments] = useState<Comment[]>([]);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [likingId, setLikingId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const { ask, dialog: confirmDialog } = useConfirmDialog();
  const role = session?.user?.role;
  const isAdmin = String(role) === Role.ADMIN;

  const fetchComments = useCallback(async () => {
    try {
      const res = await fetch(`/api/matches/${matchId}/comments`, { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();
      setComments(data.items);
    } catch { /* silent */ }
  }, [matchId]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  const handleSubmit = async () => {
    const trimmed = body.trim();
    if (!trimmed || sending) return;

    setSending(true);
    setError('');

    try {
      const res = await fetch(`/api/matches/${matchId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ body: trimmed }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(
          data.error ||
            (typeof data.detail === 'string' ? data.detail : null) ||
            t('forum.error'),
        );
        return;
      }

      const comment: Comment = await res.json();
      setComments((prev) => [comment, ...prev]);
      setBody('');

      requestAnimationFrame(() => {
        listRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      });
    } catch {
      setError(t('forum.connectionError'));
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleToggleLike = async (commentId: string) => {
    if (!session?.user || likingId) return;
    setLikingId(commentId);
    try {
      const res = await fetch(`/api/matches/${matchId}/comments/${commentId}/like`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) return;
      const data = (await res.json()) as { liked: boolean; likes: number };
      setComments((prev) =>
        prev.map((c) => (c.id === commentId ? { ...c, likes: data.likes, likedByMe: data.liked } : c)),
      );
    } catch {
      /* silent — beğeni kritik değil */
    } finally {
      setLikingId(null);
    }
  };

  // Onay: tarayıcının `window.confirm`'ü yerine stilize ConfirmDialog (Gündem silme akışıyla aynı bileşen).
  // Hata olursa modal açık kalır ve `forum.deleteError` gösterir.
  const handleDeleteComment = (commentId: string) => {
    if (!isAdmin || deletingId) return;
    ask({
      title: t('forum.deleteTitle'),
      message: t('forum.confirmDelete'),
      confirmLabel: t('common:dialog.delete'),
      cancelLabel: t('common:dialog.cancel'),
      errorMessage: t('forum.deleteError'),
      onConfirm: async () => {
        setDeletingId(commentId);
        setError('');
        try {
          const res = await fetch(`/api/matches/${matchId}/comments/${commentId}`, {
            method: 'DELETE',
            credentials: 'include',
          });
          if (!res.ok) throw new Error('delete failed');
          setComments((prev) => prev.filter((c) => c.id !== commentId));
        } finally {
          setDeletingId(null);
        }
      },
    });
  };

  return (
    <div className={styles.container}>
      <h4 className={styles.title}>{t('forum.title')}</h4>

      <div className={styles.commentList} ref={listRef}>
        {comments.length === 0 ? (
          <EmptyState>{t('forum.empty')}</EmptyState>
        ) : (
          comments.map((c) => (
            <div
              key={c.id}
              className={`${styles.comment} ${isAdmin ? styles.commentWithAdminActions : ''}`.trim()}
            >
              {isAdmin && (
                <button
                  type="button"
                  className={styles.deleteIconBtn}
                  onClick={() => handleDeleteComment(c.id)}
                  disabled={deletingId === c.id}
                  aria-label={deletingId === c.id ? t('forum.deleting') : t('forum.deleteComment')}
                  title={t('forum.deleteComment')}
                >
                  {deletingId === c.id ? (
                    <span className={styles.deleteSpinner} aria-hidden />
                  ) : (
                    <TrashIcon className={styles.deleteIconSvg} />
                  )}
                </button>
              )}
              <Avatar name={c.user.name} image={c.user.image} />
              <div className={styles.commentBody}>
                <div className={styles.commentHeader}>
                  <span className={styles.userName}>{c.user.name ?? t('forum.anonymous')}</span>
                  <span className={styles.time}>{formatRelativeTime(c.createdAt, t)}</span>
                </div>
                <p className={styles.commentText}>{c.body}</p>
                <LikeButton
                  className={styles.likeInline}
                  liked={Boolean(c.likedByMe)}
                  count={c.likes ?? 0}
                  onToggle={() => void handleToggleLike(c.id)}
                  disabled={!session?.user || likingId === c.id}
                  label={t('forum.like')}
                  title={session?.user ? t('forum.like') : t('forum.loginPrompt')}
                />
              </div>
            </div>
          ))
        )}
      </div>

      {session?.user ? (
        <>
          <div className={styles.inputArea}>
            <textarea
              className={styles.textarea}
              placeholder={t('forum.placeholder')}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={handleKeyDown}
              maxLength={500}
              rows={1}
            />
            <button
              className={styles.sendBtn}
              onClick={handleSubmit}
              disabled={sending || !body.trim()}
            >
              {t('forum.send')}
            </button>
          </div>
          {error && <div className={styles.error}>{error}</div>}
        </>
      ) : (
        <div className={styles.loginPrompt}>
          <Link href="/auth/signin">{t('forum.loginPrompt')}</Link>
        </div>
      )}
      {confirmDialog}
    </div>
  );
}
