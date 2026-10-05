/**
 * AI Asistan yanıt kartı (saf görünüm). Kilitli analizde YALNIZ ücretsiz önizleme çizilir; tam analiz alanları bu
 * bileşene hiç gelmez (sunucu göndermez — bkz. server/assistant/matchAnalysisRequest.ts).
 */
import Link from 'next/link';
import type { AssistantAnalysisCard, AssistantMatchRef } from '@/server/assistant/matchAnalysisRequest';
import type { PreviewOutcome } from '@/utils/analysisPreview';
import styles from './assistant.module.scss';

type T = (key: string, opts?: Record<string, unknown>) => string;

export type AssistantCardActions = {
  onChoose: (match: AssistantMatchRef) => void;
  onUnlock: (match: AssistantMatchRef) => void;
  /** Bu kartın açma isteği sürüyor. */
  unlocking?: boolean;
  /** Açma hatası (yetersiz kredi vb.). */
  unlockError?: 'insufficient' | 'error' | null;
};

function outcomeLabel(t: T, match: AssistantMatchRef, top: { outcome: PreviewOutcome; pct: number } | null): string | null {
  if (!top) return null;
  const who = top.outcome === 'HOME' ? t('assistant.wins', { team: match.home }) : top.outcome === 'AWAY' ? t('assistant.wins', { team: match.away }) : t('assistant.draw');
  return `${who} %${top.pct}`;
}

const kickoffText = (ms: number | null) =>
  ms == null ? '' : new Date(ms).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', timeZone: 'Europe/Istanbul' });

export default function AssistantCard({ card, t, actions }: { card: AssistantAnalysisCard; t: T; actions: AssistantCardActions }) {
  switch (card.kind) {
    case 'not-understood':
      return <p className={styles.text}>{t('assistant.notUnderstood')}</p>;
    case 'team-not-found':
      return <p className={styles.text}>{t('assistant.teamNotFound', { query: card.query })}</p>;
    case 'match-not-found':
      return <p className={styles.text}>{t('assistant.matchNotFound', { home: card.home, away: card.away })}</p>;
    case 'choose':
      return (
        <div className={styles.card}>
          <p className={styles.text}>{t('assistant.choose')}</p>
          {card.options.map((m) => (
            <button key={m.id} type="button" className={styles.option} onClick={() => actions.onChoose(m)}>
              {m.home} – {m.away}
              {m.kickoffMs != null ? <span className={styles.muted}> · {kickoffText(m.kickoffMs)}</span> : null}
            </button>
          ))}
        </div>
      );
    case 'none':
      return (
        <div className={styles.card}>
          <strong className={styles.matchTitle}>
            {card.match.home} – {card.match.away}
          </strong>
          <p className={styles.text}>{t('assistant.none')}</p>
          <Link href={card.match.href} className={styles.link}>
            {t('assistant.matchPage')} →
          </Link>
        </div>
      );
    case 'locked': {
      const top = outcomeLabel(t, card.match, card.preview.top);
      return (
        <div className={styles.card}>
          <strong className={styles.matchTitle}>
            {card.match.home} – {card.match.away}
          </strong>
          <span className={styles.label}>{t('assistant.preview')}</span>
          {top ? (
            <p className={styles.top}>
              {t('assistant.mostLikely')}: <b>{top}</b>
            </p>
          ) : null}
          {card.preview.summary.length ? (
            <ul className={styles.points}>
              {card.preview.summary.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          ) : null}
          <p className={styles.muted}>{t('assistant.locked')}</p>
          {card.signedIn ? (
            <button type="button" className={styles.unlock} disabled={actions.unlocking} onClick={() => actions.onUnlock(card.match)}>
              {actions.unlocking ? t('assistant.unlocking') : t('assistant.unlock', { cost: card.cost })}
            </button>
          ) : (
            <Link href="/auth/signin" className={styles.unlock}>
              {t('assistant.signIn')}
            </Link>
          )}
          {actions.unlockError === 'insufficient' ? (
            <p className={styles.error}>
              {t('assistant.insufficient')}{' '}
              <Link href="/credits" className={styles.link}>
                {t('assistant.buyCredits')}
              </Link>
            </p>
          ) : actions.unlockError === 'error' ? (
            <p className={styles.error}>{t('assistant.error')}</p>
          ) : null}
        </div>
      );
    }
    case 'summary': {
      const top = outcomeLabel(t, card.match, card.top);
      return (
        <div className={styles.card}>
          <strong className={styles.matchTitle}>
            {card.match.home} – {card.match.away}
          </strong>
          <span className={styles.label}>{t('assistant.summary')}</span>
          {top ? (
            <p className={styles.top}>
              {t('assistant.mostLikely')}: <b>{top}</b>
            </p>
          ) : null}
          {card.points.length ? (
            <ul className={styles.points}>
              {card.points.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          ) : null}
          <Link href={card.match.href} className={styles.link}>
            {t('assistant.openTab')} →
          </Link>
          <small className={styles.muted}>{t('assistant.disclaimer')}</small>
        </div>
      );
    }
    default:
      return null;
  }
}
