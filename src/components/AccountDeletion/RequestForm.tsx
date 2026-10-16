import { useId, useState, type FormEvent } from 'react';
import { useTurnstile } from '@/hooks/useTurnstile';
import type { AccountDeletionText } from './content';
import styles from './accountDeletion.module.scss';

type Status = { kind: 'idle' } | { kind: 'sent' } | { kind: 'error'; message: string };

/**
 * Giriş yapmadan silme talebi: e-posta + Turnstile → POST /api/account-deletion/request. Sunucu her durumda aynı yanıtı
 * verir; form da yalnız "kayıtlıysa gönderdik" der. Turnstile betiği alana ilk odaklanınca yüklenir (ilk yük hafif).
 */
export default function RequestForm({ text, locale }: { text: AccountDeletionText['page']['signedOut']; locale: 'tr' | 'en' }) {
  const id = useId();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const {
    required: turnstileRequired,
    token: turnstileToken,
    reset: resetTurnstile,
    containerRef: turnstileRef,
    activate: activateTurnstile,
  } = useTurnstile({ deferUntilActivated: true });

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (loading) return;
    activateTurnstile();
    if (turnstileRequired && !turnstileToken) {
      setStatus({ kind: 'error', message: text.verifyFirst });
      return;
    }
    setLoading(true);
    setStatus({ kind: 'idle' });
    try {
      const res = await fetch('/api/account-deletion/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, turnstileToken: turnstileToken, locale }),
      });
      const data = (await res.json().catch(() => ({}))) as { code?: string };
      if (res.ok) setStatus({ kind: 'sent' });
      else if (res.status === 429) setStatus({ kind: 'error', message: text.rateLimited });
      else if (data.code === 'INVALID_EMAIL') setStatus({ kind: 'error', message: text.invalidEmail });
      else if (data.code === 'TURNSTILE_FAILED' && res.status === 400) setStatus({ kind: 'error', message: text.verifyFirst });
      else setStatus({ kind: 'error', message: text.error });
    } catch {
      setStatus({ kind: 'error', message: text.connectionError });
    } finally {
      setLoading(false);
      // Turnstile belirteci tek kullanımlık: her gönderimden sonra yenisi.
      resetTurnstile();
    }
  };

  const inputId = `${id}-email`;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const isError = status.kind === 'error';

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      <label htmlFor={inputId} className={styles.label}>
        {text.emailLabel}
      </label>
      <input
        id={inputId}
        className={styles.input}
        type="email"
        name="email"
        autoComplete="email"
        inputMode="email"
        required
        maxLength={254}
        value={email}
        onFocus={activateTurnstile}
        onChange={(e) => setEmail(e.target.value)}
        aria-describedby={isError ? `${hintId} ${errorId}` : hintId}
        aria-invalid={isError || undefined}
      />
      <p id={hintId} className={styles.hint}>
        {text.emailHint}
      </p>

      {turnstileRequired ? <div ref={turnstileRef} className={styles.turnstile} /> : null}

      <button type="submit" className={styles.primaryButton} disabled={loading || !email.trim()}>
        {loading ? text.submitting : text.submit}
      </button>

      {/* Sonuç / hata ekran okuyucuya duyurulur (alan her zaman DOM'da: aria-live içerik değişince okur). */}
      <div aria-live="polite" role="status" className={styles.liveRegion}>
        {status.kind === 'sent' ? <p className={styles.success}>{text.sent}</p> : null}
        {isError ? (
          <p id={errorId} className={styles.error}>
            {status.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}
