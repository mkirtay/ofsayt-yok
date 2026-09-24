import Link from 'next/link';
import { useRef, useState, type FocusEvent, type KeyboardEvent } from 'react';
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

/** `post-inline`: kapalıyken tek satır, odakta tam composer'a genişler (X.com kalıbı); gönderi composer'ıyla aynı gönderim/hata mantığı. */
export type PostComposerVariant = 'post' | 'post-inline' | 'comment';

/**
 * Inline varyantta odak composer'dan çıkınca küçülme kararı: yalnızca alan boşsa VE odak composer'ın içinde kalmıyorsa
 * (ör. "Paylaş" düğmesine geçiş küçülmeye yol açmamalı). Metin varsa açık kalır — kullanıcı yazdığını kaybetmez.
 */
export function shouldCollapseOnBlur(value: string, focusStaysInside: boolean): boolean {
  return !focusStaysInside && value.trim().length === 0;
}

export type PostComposerProps = {
  /** Oturum yoksa form yerine giriş bağlantısı gösterilir. */
  authenticated: boolean;
  variant: PostComposerVariant;
  maxLength: number;
  /** Gönderir; hata fırlatırsa (GundemApiError) mesaj gösterilir, metin korunur. Başarıda alan temizlenir. */
  onSubmit: (body: string) => Promise<unknown>;
  autoFocus?: boolean;
  /** Varsayılan yer tutucunun yerine (ör. maç forumu: "Maç hakkında ne düşünüyorsun?"). */
  placeholder?: string;
};

/**
 * Gönderi/yorum yazma alanı (paylaşımlı). Enter = yeni satır, Ctrl/Cmd+Enter = gönder.
 * Sayaç kalan karakteri gösterir; ≤ COUNTER_WARN_AT'de uyarı (amber) rengi.
 */
export default function PostComposer({ authenticated, variant, maxLength, onSubmit, autoFocus, placeholder }: PostComposerProps) {
  const { t } = useTranslation('gundem');
  const [value, setValue] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const isInline = variant === 'post-inline';
  const isPost = variant !== 'comment';
  // Inline: `autoFocus` odak alıp açılmayı da tetikler (onFocus) — ilk render'da bile açık başlasın
  const [expanded, setExpanded] = useState(!isInline || !!autoFocus);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Gönderim sonrası odağı alana geri verirken yeniden açılmayı bastırır
  const skipExpandOnFocus = useRef(false);

  if (!authenticated) {
    return (
      <div className={`${styles.loginPrompt} ${isInline ? styles.loginInline : ''}`.trim()}>
        <Link href="/auth/signin">{t(isPost ? 'composer.loginPrompt' : 'composer.commentLoginPrompt')}</Link>
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
      if (isInline) {
        // Başarılı gönderim → tek satıra dön; "Paylaş" düğmesi kaybolacağı için odak alana döner (kaybolmaz)
        skipExpandOnFocus.current = true;
        setExpanded(false);
        textareaRef.current?.focus();
        skipExpandOnFocus.current = false;
      }
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

  function onBlur(e: FocusEvent<HTMLDivElement>) {
    if (!isInline || sending) return;
    if (shouldCollapseOnBlur(value, e.currentTarget.contains(e.relatedTarget as Node | null))) setExpanded(false);
  }

  const placeholderText =
    placeholder ?? t(isInline ? 'composer.inlinePlaceholder' : isPost ? 'composer.postPlaceholder' : 'composer.commentPlaceholder');
  const collapsed = isInline && !expanded;

  return (
    <div
      className={[styles.composer, variant === 'comment' ? styles.compact : '', isInline ? styles.inline : '', collapsed ? styles.collapsed : '']
        .filter(Boolean)
        .join(' ')}
      onBlur={onBlur}
    >
      <textarea
        ref={textareaRef}
        className={styles.textarea}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={() => {
          if (isInline && !skipExpandOnFocus.current) setExpanded(true);
        }}
        placeholder={placeholderText}
        aria-label={placeholderText}
        data-expanded={isInline ? expanded : undefined}
        maxLength={maxLength}
        rows={collapsed ? 1 : isPost ? 3 : 2}
        autoFocus={autoFocus}
      />
      {collapsed ? null : (
        <>
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
              {sending ? t('composer.sending') : t(isPost ? 'composer.postSubmit' : 'composer.commentSubmit')}
            </button>
          </div>
          {error ? (
            <div className={styles.error} role="alert">
              {error}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
