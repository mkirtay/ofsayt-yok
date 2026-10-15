import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import styles from './toast.module.scss';

export type ToastKind = 'success' | 'error';
type ToastState = { id: number; kind: ToastKind; text: string } | null;

export type ToastViewProps = { toast: ToastState; closeLabel: string; onClose: () => void };

/**
 * Kısa, kendiliğinden kapanan bildirim. Canlı bölge HER ZAMAN DOM'da (boşken de) → metin değişince ekran okuyucu duyurur:
 * başarı `role="status"` (polite), hata `role="alert"` (assertive). Kapat düğmesi 32×32 px.
 */
export function ToastView({ toast, closeLabel, onClose }: ToastViewProps) {
  return (
    <div className={styles.region}>
      <div role="status" aria-live="polite" aria-atomic="true">
        {toast?.kind === 'success' ? <ToastBox toast={toast} closeLabel={closeLabel} onClose={onClose} /> : null}
      </div>
      <div role="alert" aria-live="assertive" aria-atomic="true">
        {toast?.kind === 'error' ? <ToastBox toast={toast} closeLabel={closeLabel} onClose={onClose} /> : null}
      </div>
    </div>
  );
}

function ToastBox({ toast, closeLabel, onClose }: { toast: NonNullable<ToastState>; closeLabel: string; onClose: () => void }) {
  return (
    <div className={`${styles.toast} ${toast.kind === 'error' ? styles.error : styles.success}`}>
      <span className={styles.text}>{toast.text}</span>
      <button type="button" className={styles.close} onClick={onClose} aria-label={closeLabel} title={closeLabel}>
        <span aria-hidden="true">×</span>
      </button>
    </div>
  );
}

const noopSubscribe = () => () => {};

/**
 * `const { show, toastNode } = useToast(closeLabel)` → `show('success', 'Kaydedildi')`; `toastNode` bileşen çıktısında bir
 * yerde render edilir (portal ile uygulama köküne). Başarı 4 sn, hata 7 sn sonra kapanır; yeni bildirim eskisinin yerini alır.
 */
export function useToast(closeLabel: string): { show: (kind: ToastKind, text: string) => void; toastNode: ReactNode } {
  const [toast, setToast] = useState<ToastState>(null);
  // Sunucuda / hidrasyonda false, istemcide true (portal hedefi yalnız tarayıcıda).
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const seq = useRef(0);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), toast.kind === 'error' ? 7000 : 4000);
    return () => window.clearTimeout(timer);
  }, [toast]);
  const show = useCallback((kind: ToastKind, text: string) => setToast({ id: ++seq.current, kind, text }), []);
  const close = useCallback(() => setToast(null), []);
  const view = <ToastView toast={toast} closeLabel={closeLabel} onClose={close} />;
  const toastNode = mounted ? createPortal(view, document.querySelector('[data-app-root]') ?? document.body) : null;
  return { show, toastNode };
}
