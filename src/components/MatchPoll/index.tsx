import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useTranslation } from '@/lib/i18n';
import Link from 'next/link';
import styles from './matchPoll.module.scss';

interface MatchPollProps {
  matchId: string;
}

type Prediction = 'HOME' | 'DRAW' | 'AWAY';

interface PollData {
  home: number;
  draw: number;
  away: number;
  total: number;
  userPrediction: Prediction | null;
}

function pct(votes: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((votes / total) * 100);
}

export default function MatchPoll({ matchId }: MatchPollProps) {
  const { data: session } = useSession();
  const { t } = useTranslation('match');
  const [poll, setPoll] = useState<PollData | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

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
      if (submitting) return;
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
          setError(data.error || t('poll.error'));
        } else {
          setPoll(data as PollData);
        }
      } catch {
        setError(t('common:connectionError'));
      } finally {
        setSubmitting(false);
      }
    },
    [matchId, submitting, t]
  );

  const BUTTONS: { key: Prediction; labelKey: string }[] = [
    { key: 'HOME', labelKey: 'poll.home' },
    { key: 'DRAW', labelKey: 'poll.draw' },
    { key: 'AWAY', labelKey: 'poll.away' },
  ];

  return (
    <div className={styles.poll}>
      <h3 className={styles.title}>{t('poll.title')}</h3>
      <p className={styles.subtitle}>{t('poll.subtitle')}</p>

      <div className={styles.buttons}>
        {BUTTONS.map(({ key, labelKey }) => {
          const votes = poll ? (key === 'HOME' ? poll.home : key === 'DRAW' ? poll.draw : poll.away) : 0;
          const percentage = poll ? pct(votes, poll.total) : 0;
          const isSelected = poll?.userPrediction === key;
          const hasVoted = !!poll?.userPrediction;

          return (
            <button
              key={key}
              type="button"
              disabled={submitting || !session}
              onClick={() => void vote(key)}
              className={`${styles.voteBtn} ${isSelected ? styles.voteBtnSelected : ''}`}
              aria-pressed={isSelected}
            >
              <span className={styles.voteBtnLabel}>{t(labelKey)}</span>
              {hasVoted && poll && (
                <span className={styles.voteBtnPct}>{percentage}%</span>
              )}
              {hasVoted && poll && poll.total > 0 && (
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
        <p className={styles.meta}>{t('poll.totalVotes', { count: poll.total })}</p>
      )}

      {!session && (
        <p className={styles.loginCta}>
          {t('poll.loginCta')}{' '}
          <Link href="/auth/signin" className={styles.loginLink}>
            {t('poll.loginLink')}
          </Link>
          .
        </p>
      )}

      {error && <p className={styles.error}>{error}</p>}
    </div>
  );
}
