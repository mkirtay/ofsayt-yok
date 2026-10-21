import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useTranslation } from '@/lib/i18n';
import Link from 'next/link';
import TeamLogo from '@/components/TeamLogo';
import styles from './matchPoll.module.scss';

/** Seçenek etiketinde gösterilecek takım (maç verisinden; ek istek yok). */
export interface PollTeam {
  name?: string | null;
  logo?: string | null;
}

interface MatchPollProps {
  matchId: string;
  /** Maç başladı/bitti: oy verilemez, sonuç herkese gösterilir (bkz. utils/matchPollLock.ts). */
  locked?: boolean;
  /** Ev sahibi / deplasman: varsa seçenekler "logo + takım adı", yoksa "Ev Sahibi / Deplasman" metni. */
  home?: PollTeam | null;
  away?: PollTeam | null;
}

type Prediction = 'HOME' | 'DRAW' | 'AWAY';

interface PollData {
  home: number;
  draw: number;
  away: number;
  total: number;
  userPrediction: Prediction | null;
}

/**
 * Dar ekranda takım adının sığma biçimi (CSS yalnız ≤480 px'te uygular): çok kelimeli ad en çok iki satır;
 * tek kelimelik ad bölünmez, tek satır + (…) — 12+ harfliyse bir punto küçük.
 */
function nameClass(name: string): string {
  if (/\s/.test(name)) return styles.voteBtnTextMulti;
  return name.length >= 12 ? styles.voteBtnTextLongWord : '';
}

function pct(votes: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((votes / total) * 100);
}

export default function MatchPoll({ matchId, locked: lockedProp = false, home = null, away = null }: MatchPollProps) {
  const { data: session } = useSession();
  const { t } = useTranslation('match');
  const [poll, setPoll] = useState<PollData | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  // Sunucu 409 LOCKED dediyse (istemcinin maç verisi geride kaldıysa) da kilitli çizilir.
  const [serverLocked, setServerLocked] = useState(false);
  const locked = lockedProp || serverLocked;

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
      if (submitting || locked) return;
      setSubmitting(true);
      setError('');
      try {
        const res = await fetch(`/api/matches/${matchId}/poll`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prediction }),
        });
        const data = await res.json();
        if (res.status === 409 && data.code === 'LOCKED') {
          setServerLocked(true);
        } else if (!res.ok) {
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
    [matchId, submitting, locked, t]
  );

  // İki takımın adı da varsa takım modu (yarım veriyle "Galatasaray / Deplasman" karışık görünmesin).
  const homeName = home?.name?.trim() || '';
  const awayName = away?.name?.trim() || '';
  const teamMode = !!homeName && !!awayName;

  const BUTTONS: { key: Prediction; label: string; team: PollTeam | null; ariaLabel: string }[] = [
    {
      key: 'HOME',
      label: teamMode ? homeName : t('poll.home'),
      team: teamMode ? home : null,
      ariaLabel: teamMode ? t('poll.teamWins', { team: homeName }) : t('poll.home'),
    },
    { key: 'DRAW', label: t('poll.draw'), team: null, ariaLabel: t('poll.draw') },
    {
      key: 'AWAY',
      label: teamMode ? awayName : t('poll.away'),
      team: teamMode ? away : null,
      ariaLabel: teamMode ? t('poll.teamWins', { team: awayName }) : t('poll.away'),
    },
  ];

  return (
    <div className={styles.poll}>
      <h4 className={styles.title}>{t('poll.title')}</h4>
      <p className={styles.subtitle}>{t(locked ? 'poll.subtitleLocked' : 'poll.subtitle')}</p>

      <div className={`${styles.buttons} ${teamMode ? styles.teamMode : ''}`} role="group" aria-label={t('poll.title')}>
        {BUTTONS.map(({ key, label, team, ariaLabel }) => {
          const votes = poll ? (key === 'HOME' ? poll.home : key === 'DRAW' ? poll.draw : poll.away) : 0;
          const percentage = poll ? pct(votes, poll.total) : 0;
          const isSelected = poll?.userPrediction === key;
          // Kilitliyken sonuç herkese açık; açıkken yalnız oy veren görür.
          const showResult = locked || !!poll?.userPrediction;

          return (
            <button
              key={key}
              type="button"
              disabled={locked || submitting || !session}
              onClick={() => void vote(key)}
              className={`${styles.voteBtn} ${isSelected ? styles.voteBtnSelected : ''} ${key === 'DRAW' ? styles.voteBtnDraw : ''}`}
              aria-pressed={isSelected}
              aria-label={showResult && poll ? t('poll.optionResult', { label: ariaLabel, pct: percentage }) : ariaLabel}
              title={team ? label : undefined}
            >
              <span className={styles.voteBtnLabel}>
                {team && (
                  <TeamLogo
                    src={team.logo}
                    width={20}
                    className={styles.voteBtnLogo}
                    fallback={<span className={styles.voteBtnLogoFallback} aria-hidden />}
                  />
                )}
                <span className={`${styles.voteBtnText} ${team ? nameClass(label) : ''}`}>{label}</span>
              </span>
              {showResult && poll && (
                <span className={styles.voteBtnPct}>{percentage}%</span>
              )}
              {showResult && poll && poll.total > 0 && (
                <span className={styles.voteBtnTrack} aria-hidden>
                  <span className={styles.voteBtnBar} style={{ width: `${percentage}%` }} />
                </span>
              )}
            </button>
          );
        })}
      </div>

      {poll && poll.total > 0 && (
        <p className={styles.meta}>{t('poll.totalVotes', { count: poll.total })}</p>
      )}

      {locked && poll && poll.total === 0 && <p className={styles.meta}>{t('poll.lockedNoVotes')}</p>}

      {!session && !locked && (
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
