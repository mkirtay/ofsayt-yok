/**
 * AI Asistan kartları (saf görünüm) — veriyi sunucu araç çıktısından üretir, model değil.
 * Analiz kartı: kilitliyken YALNIZ ücretsiz önizleme çizilir; tam analiz alanları bu bileşene hiç gelmez
 * (sunucu göndermez — bkz. server/assistant/matchAnalysisRequest.ts). Maç kartı: saat/skor/kanal + maç linki.
 */
import Link from 'next/link';
import type { AssistantAnalysisCard, AssistantMatchRef } from '@/server/assistant/matchAnalysisRequest';
import type { PreviewOutcome } from '@/utils/analysisPreview';
import type { AssistantCard as AssistantCardData, AssistantMatchItem } from '@/server/assistant/tools';
import { assistantSignInHref } from './signInHref';
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
  const who = top.outcome === 'HOME' ? t('card.wins', { team: match.home }) : top.outcome === 'AWAY' ? t('card.wins', { team: match.away }) : t('card.draw');
  return `${who} %${top.pct}`;
}

const kickoffText = (ms: number | null) =>
  ms == null ? '' : new Date(ms).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', timeZone: 'Europe/Istanbul' });
const kickoffTime = (ms: number) => new Date(ms).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/Istanbul' });

export function AnalysisCard({ card, t, actions }: { card: AssistantAnalysisCard; t: T; actions: AssistantCardActions }) {
  switch (card.kind) {
    case 'not-understood':
    case 'team-not-found':
    case 'match-not-found':
      // v2'de bu durumları model metinle anlatır; kart yok.
      return null;
    case 'choose':
      return (
        <div className={styles.card}>
          <p className={styles.text}>{t('card.choose')}</p>
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
          {card.match.kickoffMs != null ? (
            <span className={styles.muted}>
              {kickoffText(card.match.kickoffMs)} {kickoffTime(card.match.kickoffMs)}
            </span>
          ) : null}
          <p className={styles.text}>{t(card.reason === 'scheduled' ? 'card.none' : card.reason === 'self-serve' ? 'card.selfServe' : 'card.notPlanned', { cost: card.cost })}</p>
          {card.reason === 'self-serve' ? (
            // Yalnız yönlendirme: üretim maç sayfasında, kullanıcının kendi tıklamasıyla.
            card.signedIn ? (
              <Link href={card.match.href} className={styles.unlock}>
                {t('card.goToAnalysisTab')}
              </Link>
            ) : (
              <Link href={assistantSignInHref(card.match.href)} className={styles.unlock}>
                {t('signIn')}
              </Link>
            )
          ) : (
            <Link href={card.match.href} className={styles.link}>
              {t('card.matchPage')} →
            </Link>
          )}
        </div>
      );
    case 'locked': {
      const top = outcomeLabel(t, card.match, card.preview.top);
      return (
        <div className={styles.card}>
          <strong className={styles.matchTitle}>
            {card.match.home} – {card.match.away}
          </strong>
          <span className={styles.label}>{t('card.preview')}</span>
          {top ? (
            <p className={styles.top}>
              {t('card.mostLikely')}: <b>{top}</b>
            </p>
          ) : null}
          {card.preview.summary.length ? (
            <ul className={styles.points}>
              {card.preview.summary.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          ) : null}
          <p className={styles.muted}>{t('card.locked')}</p>
          {card.signedIn ? (
            <button type="button" className={styles.unlock} disabled={actions.unlocking} onClick={() => actions.onUnlock(card.match)}>
              {actions.unlocking ? t('card.unlocking') : t('card.unlock', { cost: card.cost })}
            </button>
          ) : (
            <Link href="/auth/signin" className={styles.unlock}>
              {t('card.signIn')}
            </Link>
          )}
          {actions.unlockError === 'insufficient' ? (
            <p className={styles.error}>
              {t('card.insufficient')}{' '}
              <Link href="/credits" className={styles.link}>
                {t('card.buyCredits')}
              </Link>
            </p>
          ) : actions.unlockError === 'error' ? (
            <p className={styles.error}>{t('card.error')}</p>
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
          <span className={styles.label}>{t('card.summary')}</span>
          {top ? (
            <p className={styles.top}>
              {t('card.mostLikely')}: <b>{top}</b>
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
            {t('card.openTab')} →
          </Link>
          <small className={styles.muted}>{t('card.disclaimer')}</small>
        </div>
      );
    }
    default:
      return null;
  }
}

function matchState(m: AssistantMatchItem, t: T): string {
  if (m.status === 'IN PLAY' || m.status === 'HALF TIME BREAK') return `${t('card.live')}${m.minute ? ` ${m.minute}'` : ''}`;
  if (m.status === 'FINISHED') return t('card.finished');
  return m.kickoffMs != null ? `${kickoffText(m.kickoffMs)} ${kickoffTime(m.kickoffMs)}` : '';
}

export function MatchesCard({ matches, t }: { matches: AssistantMatchItem[]; t: T }) {
  return (
    <div className={styles.card}>
      {matches.map((m) => (
        <Link key={m.id} href={m.href} className={styles.matchRow}>
          <span className={styles.matchTeams}>
            {m.home} {m.score ? <b>{m.score}</b> : '–'} {m.away}
          </span>
          <span className={styles.muted}>
            {matchState(m, t)}
            {m.tv?.length ? ` · ${m.tv.join(', ')}` : ''}
          </span>
        </Link>
      ))}
    </div>
  );
}

export default function AssistantCard({ card, t, actions }: { card: AssistantCardData; t: T; actions: AssistantCardActions }) {
  return card.type === 'matches' ? <MatchesCard matches={card.matches} t={t} /> : <AnalysisCard card={card.card} t={t} actions={actions} />;
}
