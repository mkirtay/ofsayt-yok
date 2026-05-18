import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import styles from './matchPoll.module.scss';

interface MatchPollProps {
  matchId: string;
  matchStatus: string;
}

type Prediction = 'HOME' | 'DRAW' | 'AWAY';

interface PollData {
  home: number;
  draw: number;
  away: number;
  total: number;
  userPrediction: Prediction | null;
}

function isOpenStatus(status: string): boolean {
  return status === 'NOT STARTED' || status === 'SCHEDULED';
}

function pct(votes: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((votes / total) * 100);
}

export default function MatchPoll({ matchId, matchStatus }: MatchPollProps) {
  const { data: session } = useSession();
  const [poll, setPoll] = useState<PollData | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const isOpen = isOpenStatus(matchStatus);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/matches/${matchId}/poll`)
      .then((r) => r.json())
      .then((data: PollData) => { if (!cancelled) setPoll(data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [matchId]);

  const vote = useCallback(
    async (prediction: Prediction) => {
      if (submitting || !isOpen) return;
      setSubmitting(true);
      setError('');
      try {
        const res = await fetch(`/api/matches/${matchId}/poll`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prediction }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || 'Bir hata oluştu.');
        } else {
          setPoll(data as PollData);
        }
      } catch {
        setError('Bağlantı hatası. Lütfen tekrar deneyin.');
      } finally {
        setSubmitting(false);
      }
    },
    [matchId, submitting, isOpen]
  );

  const BUTTONS: { key: Prediction; label: string }[] = [
    { key: 'HOME', label: 'Ev Sahibi' },
    { key: 'DRAW', label: 'Beraberlik' },
    { key: 'AWAY', label: 'Deplasman' },
  ];

  return (
    <div className={styles.poll}>
      <h3 className={styles.title}>Topluluk Tahmini</h3>
      <p className={styles.subtitle}>Bu maçın sonucu ne olacak?</p>

      {!isOpen && (
        <p className={styles.closed}>Maç başladı, oylamaya kapalı.</p>
      )}

      <div className={styles.buttons}>
        {BUTTONS.map(({ key, label }) => {
          const votes = poll ? (key === 'HOME' ? poll.home : key === 'DRAW' ? poll.draw : poll.away) : 0;
          const percentage = poll ? pct(votes, poll.total) : 0;
          const isSelected = poll?.userPrediction === key;
          const hasVoted = !!poll?.userPrediction;

          return (
            <button
              key={key}
              type="button"
              disabled={!isOpen || submitting || (!session && isOpen)}
              onClick={() => vote(key)}
              className={`${styles.voteBtn} ${isSelected ? styles.voteBtnSelected : ''} ${!isOpen ? styles.voteBtnClosed : ''}`}
              aria-pressed={isSelected}
            >
              <span className={styles.voteBtnLabel}>{label}</span>
              {(hasVoted || !isOpen) && poll && (
                <span className={styles.voteBtnPct}>{percentage}%</span>
              )}
              {(hasVoted || !isOpen) && poll && poll.total > 0 && (
                <span
                  className={styles.voteBtnBar}
                  style={{ width: `${percentage}%` }}
                  aria-hidden
                />
              )}
            </button>
          );
        })}
      </div>

      {poll && poll.total > 0 && (
        <p className={styles.meta}>Toplam {poll.total} oy</p>
      )}

      {!session && isOpen && (
        <p className={styles.loginCta}>
          Oy kullanmak için{' '}
          <Link href="/auth/signin" className={styles.loginLink}>
            giriş yapın
          </Link>
          .
        </p>
      )}

      {error && <p className={styles.error}>{error}</p>}
    </div>
  );
}
