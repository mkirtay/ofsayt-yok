import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { useSession } from 'next-auth/react';
import { useTranslation } from '@/lib/i18n';
import { Role } from '@prisma/client';
import Link from 'next/link';
import EmptyState from '@/components/EmptyState';
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

function avatarLetter(name: string | null) {
  return (name ?? '?').charAt(0).toUpperCase();
}

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      className={styles.deleteIconSvg}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
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
  const role = session?.user?.role;
  const isAdmin = String(role) === Role.ADMIN;

  function relativeTime(date: string) {
    const diff = Date.now() - new Date(date).getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 1) return t('forum.justNow');
    if (mins < 60) return t('forum.minutesAgo', { count: mins });
    const hours = Math.floor(mins / 60);
    if (hours < 24) return t('forum.hoursAgo', { count: hours });
    const days = Math.floor(hours / 24);
    return t('forum.daysAgo', { count: days });
  }

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

  const handleDeleteComment = async (commentId: string) => {
    if (!isAdmin || deletingId) return;
    if (!window.confirm(t('forum.confirmDelete'))) return;

    setDeletingId(commentId);
    setError('');
    try {
      const res = await fetch(`/api/matches/${matchId}/comments/${commentId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || t('forum.deleteError'));
        return;
      }
      setComments((prev) => prev.filter((c) => c.id !== commentId));
    } catch {
      setError(t('forum.connectionError'));
    } finally {
      setDeletingId(null);
    }
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
                    <TrashIcon />
                  )}
                </button>
              )}
              <div className={styles.avatar}>
                {c.user.image ? (
                  <Image src={c.user.image} alt="" width={28} height={28} style={{ borderRadius: '50%' }} unoptimized />
                ) : (
                  avatarLetter(c.user.name)
                )}
              </div>
              <div className={styles.commentBody}>
                <div className={styles.commentHeader}>
                  <span className={styles.userName}>{c.user.name ?? t('forum.anonymous')}</span>
                  <span className={styles.time}>{relativeTime(c.createdAt)}</span>
                </div>
                <p className={styles.commentText}>{c.body}</p>
                <button
                  type="button"
                  className={`${styles.likeBtn} ${c.likedByMe ? styles.likeBtnActive : ''}`.trim()}
                  onClick={() => void handleToggleLike(c.id)}
                  disabled={!session?.user || likingId === c.id}
                  aria-pressed={Boolean(c.likedByMe)}
                  aria-label={t('forum.like')}
                  title={session?.user ? t('forum.like') : t('forum.loginPrompt')}
                >
                  <HeartIcon filled={Boolean(c.likedByMe)} />
                  <span className={styles.likeCount}>{c.likes ?? 0}</span>
                </button>
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
    </div>
  );
}
