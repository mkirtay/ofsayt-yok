import Link from 'next/link';
import { useState } from 'react';
import { COUNTER_WARN_AT, POST_MAX_LENGTH } from '@/config/gundem';
import type { BotDraft, BotDraftStatus } from '@/hooks/useBotDrafts';
import { formatMinute } from '@/lib/gundem/bot/goalTemplates';
import styles from './adminBotQueue.module.scss';

export const STATUS_LABEL: Record<BotDraftStatus, string> = {
  PENDING: 'Bekliyor',
  APPROVED: 'Onaylandı (yayınlanıyor)',
  POSTED: 'Yayınlandı',
  REJECTED: 'Reddedildi',
  STALE: 'Eskidi (VAR/iptal)',
};

type Props = {
  draft: BotDraft;
  busy?: boolean;
  onSave: (id: string, body: string) => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
};

/** Tek taslak kartı (görünüm): maç adı + dakika + maç sayfası bağlantısı, düzenlenebilir metin, uyarılar, Onayla/Reddet. */
export default function BotDraftCard({ draft, busy = false, onSave, onApprove, onReject }: Props) {
  const [body, setBody] = useState(draft.body);
  const pending = draft.status === 'PENDING';
  const f = draft.facts;
  const remaining = POST_MAX_LENGTH - body.length;
  const dirty = body !== draft.body;
  const invalid = !body.trim() || remaining < 0;

  return (
    <article className={styles.card} data-status={draft.status}>
      <header className={styles.head}>
        <div className={styles.match}>
          <strong>
            {f.homeName} {f.score ? `${f.score.home}-${f.score.away}` : 'vs'} {f.awayName}
          </strong>
          <span className={styles.meta}>
            {formatMinute(f.minute, f.extraMinute)} · {f.playerName}
            {f.leagueName ? ` · ${f.leagueName}` : ''}
          </span>
        </div>
        <span className={styles.status}>{STATUS_LABEL[draft.status]}</span>
      </header>

      {pending ? (
        <div className={styles.editor}>
          <textarea
            className={styles.textarea}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            aria-label="Gönderi metni"
          />
          <span className={`${styles.counter} ${remaining <= COUNTER_WARN_AT ? styles.counterWarn : ''}`.trim()}>{remaining}</span>
        </div>
      ) : (
        <p className={styles.body}>{draft.body}</p>
      )}

      {draft.warnings.length > 0 ? (
        <ul className={styles.warnings} aria-label="Uyarılar">
          {draft.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      ) : null}

      <footer className={styles.actions}>
        <Link href={`/matches/${draft.fixtureId}`} className={styles.link} target="_blank" rel="noopener noreferrer">
          Maç sayfasını aç
        </Link>
        {pending ? (
          <>
            <button type="button" className={styles.secondary} disabled={busy || !dirty || invalid} onClick={() => onSave(draft.id, body)}>
              Kaydet
            </button>
            <button type="button" className={styles.danger} disabled={busy} onClick={() => onReject(draft.id)}>
              Reddet
            </button>
            <button type="button" className={styles.primary} disabled={busy || dirty || invalid} onClick={() => onApprove(draft.id)}>
              Onayla ve yayınla
            </button>
          </>
        ) : draft.postId ? (
          <Link href={`/gundem/${draft.postId}`} className={styles.link}>
            Gönderiyi aç
          </Link>
        ) : null}
      </footer>
      {pending && dirty ? <p className={styles.hint}>Onaylamadan önce değişikliği kaydedin.</p> : null}
    </article>
  );
}
