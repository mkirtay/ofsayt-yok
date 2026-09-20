import Link from 'next/link';
import { useState, type KeyboardEvent } from 'react';
import { COUNTER_WARN_AT } from '@/config/gundem';
import { GundemApiError } from '@/hooks/useGundem';
import { useTranslation } from '@/lib/i18n';
import styles from './postComposer.module.scss';

type TFn = (key: string, opts?: Record<string, unknown>) => string;

/** Gönderim hatası → kullanıcı mesajı: 429'da `Retry-After` ile "biraz bekle", bağlantı hatası, sunucunun Türkçe `error`'ı. */
export function composerErrorMessage(err: unknown, t: TFn): string {
  if (err instanceof GundemApiError) {
    if (err.status === 429) {
      return err.retryAfter ? t('composer.rateLimited', { seconds: err.retryAfter }) : t('composer.rateLimitedNoWait');
    }
    if (err.status === 0) return t('composer.connectionError');
    if (err.status === 401) return t('composer.loginPrompt');
    if (err.message && err.message !== 'error') return err.message;
  }
  return t('composer.error');
}

export type PostComposerProps = {
  /** Oturum yoksa form yerine giriş bağlantısı gösterilir. */
  authenticated: boolean;
  variant: 'post' | 'comment';
  maxLength: number;
  /** Gönderir; hata fırlatırsa (GundemApiError) mesaj gösterilir, metin korunur. Başarıda alan temizlenir. */
  onSubmit: (body: string) => Promise<unknown>;
  autoFocus?: boolean;
};

/**
 * Gönderi/yorum yazma alanı (paylaşımlı). Enter = yeni satır, Ctrl/Cmd+Enter = gönder.
 * Sayaç kalan karakteri gösterir; ≤ COUNTER_WARN_AT'de uyarı (amber) rengi.
 */
export default function PostComposer({ authenticated, variant, maxLength, onSubmit, autoFocus }: PostComposerProps) {
  const { t } = useTranslation('gundem');
  const [value, setValue] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  if (!authenticated) {
    return (
      <div className={styles.loginPrompt}>
        <Link href="/auth/signin">{t(variant === 'post' ? 'composer.loginPrompt' : 'composer.commentLoginPrompt')}</Link>
      </div>
    );
  }

  const remaining = maxLength - value.length;
  const warn = remaining <= COUNTER_WARN_AT;
  const canSend = value.trim().length > 0 && !sending;

  async function submit() {
    if (!canSend) return;
    setSending(true);
    setError('');
    try {
      await onSubmit(value);
      setValue('');
    } catch (err) {
      setError(composerErrorMessage(err, t));
    } finally {
      setSending(false);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void submit();
    }
  }

  return (
    <div className={`${styles.composer} ${variant === 'comment' ? styles.compact : ''}`.trim()}>
      <textarea
        className={styles.textarea}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={t(variant === 'post' ? 'composer.postPlaceholder' : 'composer.commentPlaceholder')}
        aria-label={t(variant === 'post' ? 'composer.postPlaceholder' : 'composer.commentPlaceholder')}
        maxLength={maxLength}
        rows={variant === 'post' ? 3 : 2}
        autoFocus={autoFocus}
      />
      <div className={styles.bar}>
        <span className={styles.hint}>{t('composer.hint')}</span>
        <span
          className={`${styles.counter} ${warn ? styles.counterWarn : ''}`.trim()}
          aria-live="polite"
          aria-label={t('composer.remaining', { count: remaining })}
        >
          {remaining}
        </span>
        <button type="button" className={styles.submit} onClick={() => void submit()} disabled={!canSend}>
          {sending ? t('composer.sending') : t(variant === 'post' ? 'composer.postSubmit' : 'composer.commentSubmit')}
        </button>
      </div>
      {error ? (
        <div className={styles.error} role="alert">
          {error}
        </div>
      ) : null}
    </div>
  );
}
