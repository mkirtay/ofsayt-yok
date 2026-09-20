import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { lockBodyScroll } from '@/utils/scrollLock';
import styles from './confirmDialog.module.scss';

export type ConfirmDialogViewProps = {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  /** Onay işlemi sürerken: düğmeler pasif, Esc/dış tık kapatmaz. */
  busy?: boolean;
  /** İşlem başarısız olursa diyalog açık kalır ve bu mesaj gösterilir. */
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * Yıkıcı işlemler için onay modalı (görünüm katmanı — portal'sız, test edilebilir).
 * Erişilebilirlik: `alertdialog` + `aria-modal`, ilk odak "Vazgeç" (yanlışlıkla Enter ile silmeyi önler),
 * Tab odak tuzağı, Esc/dış tık = vazgeç, kapanınca odak eski elemana döner, arka plan scroll'u kilitlenir.
 */
export function ConfirmDialogView({ title, message, confirmLabel, cancelLabel, busy, error, onConfirm, onCancel }: ConfirmDialogViewProps) {
  const titleId = useId();
  const descId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const busyRef = useRef(!!busy);
  useEffect(() => {
    busyRef.current = !!busy;
  }, [busy]);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const unlock = lockBodyScroll();
    cancelRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        // Capture aşamasında durdurulur: arkadaki panel (PostDetailPanel) Esc'yi görüp aynı anda kapanmasın.
        e.stopPropagation();
        if (!busyRef.current) onCancel();
        return;
      }
      if (e.key === 'Tab' && dialogRef.current) {
        const f = dialogRef.current.querySelectorAll<HTMLElement>('button:not(:disabled)');
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

  return (
    <div className={styles.overlay} onMouseDown={(e) => e.target === e.currentTarget && !busy && onCancel()}>
      <div ref={dialogRef} className={styles.dialog} role="alertdialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descId}>
        <div className={styles.body}>
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          <p id={descId} className={styles.message}>
            {message}
          </p>
          {error ? (
            <p className={styles.error} role="alert">
              {error}
            </p>
          ) : null}
        </div>
        <div className={styles.foot}>
          <button ref={cancelRef} type="button" className={styles.cancel} onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button type="button" className={styles.danger} onClick={onConfirm} disabled={busy}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Portal ile uygulama köküne (`_app`'teki `[data-app-root]`) basar: sticky/overflow'lu ata elemanlar kırpmaz, ama
 * `next/font` değişkeni (`--font-sans`) yalnızca bu sarmalayıcıda tanımlı — `document.body`'ye basılırsa font serif'e düşer.
 */
export default function ConfirmDialog(props: ConfirmDialogViewProps) {
  if (typeof document === 'undefined') return null;
  return createPortal(<ConfirmDialogView {...props} />, document.querySelector('[data-app-root]') ?? document.body);
}

export type AskConfirmOptions = {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  /** Onay işlemi hata fırlatırsa diyalogda gösterilir. */
  errorMessage: string;
  /** Onaylanınca çalışır; başarıda diyalog kapanır, hata fırlatırsa açık kalır. */
  onConfirm: () => Promise<unknown>;
};

/**
 * `window.confirm` yerine: `ask({...})` diyaloğu açar; dönen `dialog` düğümü bileşenin çıktısında bir yere render edilmelidir.
 * Yükleniyor/hata durumu diyalogda yönetilir (ayrı `window.alert` gerekmez).
 */
export function useConfirmDialog(): { ask: (o: AskConfirmOptions) => void; dialog: ReactNode } {
  const [opts, setOpts] = useState<AskConfirmOptions | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = useCallback(() => {
    setOpts(null);
    setBusy(false);
    setError(null);
  }, []);

  const ask = useCallback((o: AskConfirmOptions) => {
    setError(null);
    setBusy(false);
    setOpts(o);
  }, []);

  const confirm = useCallback(async () => {
    if (!opts) return;
    setBusy(true);
    setError(null);
    try {
      await opts.onConfirm();
      close();
    } catch {
      setBusy(false);
      setError(opts.errorMessage);
    }
  }, [opts, close]);

  const dialog = opts ? (
    <ConfirmDialog
      title={opts.title}
      message={opts.message}
      confirmLabel={opts.confirmLabel}
      cancelLabel={opts.cancelLabel}
      busy={busy}
      error={error}
      onConfirm={() => void confirm()}
      onCancel={close}
    />
  ) : null;

  return { ask, dialog };
}
