import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Role } from '@prisma/client';
import Link from 'next/link';
import styles from './matchForum.module.scss';

interface Comment {
  id: string;
  body: string;
  createdAt: string;
  user: { id: string; name: string | null; image: string | null };
}

interface MatchForumProps {
  matchId: string;
}

function relativeTime(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'az önce';
  if (mins < 60) return `${mins} dk`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} sa`;
  const days = Math.floor(hours / 24);
  return `${days} gün`;
}

function avatarLetter(name: string | null) {
  return (name ?? '?').charAt(0).toUpperCase();
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
  const [comments, setComments] = useState<Comment[]>([]);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
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
            'Bir hata oluştu.',
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
      setError('Bağlantı hatası.');
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

  const handleDeleteComment = async (commentId: string) => {
    if (!isAdmin || deletingId) return;
    if (!window.confirm('Bu yorumu silmek istediğinize emin misiniz?')) return;

    setDeletingId(commentId);
    setError('');
    try {
      const res = await fetch(`/api/matches/${matchId}/comments/${commentId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Yorum silinemedi.');
        return;
      }
      setComments((prev) => prev.filter((c) => c.id !== commentId));
    } catch {
      setError('Bağlantı hatası.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className={styles.container}>
      <h3 className={styles.title}>Maç Yorumları</h3>

      <div className={styles.commentList} ref={listRef}>
        {comments.length === 0 ? (
          <div className={styles.empty}>Henüz yorum yok. İlk yorumu sen yap!</div>
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
                  aria-label={deletingId === c.id ? 'Siliniyor' : 'Yorumu sil'}
                  title="Yorumu sil"
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
                  <img src={c.user.image} alt="" />
                ) : (
                  avatarLetter(c.user.name)
                )}
              </div>
              <div className={styles.commentBody}>
                <div className={styles.commentHeader}>
                  <span className={styles.userName}>{c.user.name ?? 'Anonim'}</span>
                  <span className={styles.time}>{relativeTime(c.createdAt)}</span>
                </div>
                <p className={styles.commentText}>{c.body}</p>
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
              placeholder="Yorumunuzu yazın…"
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
              Gönder
            </button>
          </div>
          {error && <div className={styles.error}>{error}</div>}
        </>
      ) : (
        <div className={styles.loginPrompt}>
          <Link href="/auth/signin">Yorum yapmak için giriş yap</Link>
        </div>
      )}
    </div>
  );
}
