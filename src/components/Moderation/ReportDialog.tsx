import Link from 'next/link';
import { createPortal } from 'react-dom';
import { useEffect, useId, useRef, useState } from 'react';
import { REPORT_NOTE_MAX, REPORT_REASONS_UI } from '@/config/moderation';
import { useTranslation } from '@/lib/i18n';
import '@/lib/i18nNamespaces/moderation';
import { lockBodyScroll } from '@/utils/scrollLock';
import type { ReportTargetType } from './api';
import styles from './moderation.module.scss';

export type ReportDialogProps = {
  targetType: ReportTargetType;
  busy: boolean;
  error: string | null;
  onSubmit: (reason: string, note: string) => void;
  onCancel: () => void;
};

/**
 * Şikâyet formu (modal): neden (tek seçim, zorunlu) + isteğe bağlı not. Erişilebilirlik: `dialog` + `aria-modal`, ilk odak
 * ilk neden, Tab odak tuzağı, Esc = vazgeç (gönderim sürerken değil), kapanınca odak eski elemana döner. Hedefler ≥ 40 px.
 */
export function ReportDialogView({ targetType, busy, error, onSubmit, onCancel }: ReportDialogProps) {
  const { t } = useTranslation('moderation');
  const titleId = useId();
  const descId = useId();
  const noteId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const busyRef = useRef(busy);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const unlock = lockBodyScroll();
    dialogRef.current?.querySelector<HTMLInputElement>('input[type="radio"]')?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        if (!busyRef.current) onCancel();
        return;
      }
      if (e.key === 'Tab' && dialogRef.current) {
        const f = dialogRef.current.querySelectorAll<HTMLElement>('input:not(:disabled), textarea:not(:disabled), a[href], button:not(:disabled)');
        if (!f.length) return;
        const first = f[0]!;
        const last = f[f.length - 1]!;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      unlock();
      previous?.focus?.();
    };
  }, [onCancel]);

  const title = t(targetType === 'COMMENT' ? 'report.titleComment' : targetType === 'USER' ? 'report.titleUser' : 'report.titlePost');

  return (
    <div className={styles.overlay} onMouseDown={(e) => e.target === e.currentTarget && !busy && onCancel()}>
      <div ref={dialogRef} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descId}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (reason && !busy) onSubmit(reason, note.trim());
          }}
        >
          <div className={styles.dialogBody}>
            <h2 id={titleId} className={styles.dialogTitle}>
              {title}
            </h2>
            <p id={descId} className={styles.dialogText}>
              {t('report.intro')}
            </p>
            <fieldset className={styles.reasons}>
              <legend className={styles.legend}>{t('report.reasonLegend')}</legend>
              {REPORT_REASONS_UI.map((r) => (
                <label key={r} className={styles.reason}>
                  <input type="radio" name="report-reason" value={r} checked={reason === r} onChange={() => setReason(r)} disabled={busy} />
                  <span>{t(`report.reasons.${r}`)}</span>
                </label>
              ))}
            </fieldset>
            <label className={styles.noteLabel} htmlFor={noteId}>
              {t('report.noteLabel')}
            </label>
            <textarea
              id={noteId}
              className={styles.note}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={REPORT_NOTE_MAX}
              placeholder={t('report.notePlaceholder')}
              rows={3}
              disabled={busy}
            />
            <Link href="/topluluk-kurallari" className={styles.rulesLink} target="_blank">
              {t('report.rulesLink')}
            </Link>
            {error ? (
              <p className={styles.dialogError} role="alert">
                {error}
              </p>
            ) : null}
          </div>
          <div className={styles.dialogFoot}>
            <button type="button" className={styles.cancel} onClick={onCancel} disabled={busy}>
              {t('report.cancel')}
            </button>
            <button type="submit" className={styles.primary} disabled={!reason || busy}>
              {busy ? t('report.sending') : t('report.submit')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function ReportDialog(props: ReportDialogProps) {
  if (typeof document === 'undefined') return null;
  return createPortal(<ReportDialogView {...props} />, document.querySelector('[data-app-root]') ?? document.body);
}
