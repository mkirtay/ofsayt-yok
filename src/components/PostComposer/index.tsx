import Link from 'next/link';
import { useRef, useState, type ComponentType, type FocusEvent, type KeyboardEvent } from 'react';
import { COUNTER_WARN_AT } from '@/config/gundem';
import { NEW_ACCOUNT_MAX_LINKS } from '@/config/moderation';
import type { MentionSuggestProps } from '@/components/Moderation/MentionSuggest';
import TeamLogo from '@/components/TeamLogo';
import type { EntityPickerProps, PickedEntity } from './EntityPicker';
import type { GundemEntityRef } from '@/types/gundem';
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
    // Moderasyon kodları (lib/moderation/contentGate.ts, authorGate): ileti seçili dilde; hangi kelime olduğu söylenmez.
    if (err.code === 'CONTENT_REJECTED') return t('composer.contentRejected');
    if (err.code === 'LINK_LIMIT') return t('composer.linkLimit', { count: NEW_ACCOUNT_MAX_LINKS });
    if (err.code === 'DUPLICATE_CONTENT') return t('composer.duplicate');
    if (err.code === 'GUNDEM_SUSPENDED') return t('composer.suspended');
    if (err.code === 'ENTITY_INVALID') return err.status === 503 ? t('composer.entityUnavailable') : t('composer.entityNotFound');
    if (err.message && err.message !== 'error') return err.message;
  }
  return t('composer.error');
}

/** Google ile oluşmuş, kullanıcı adı seçmemiş hesap: sunucu 403 + `USERNAME_REQUIRED` döner. */
export function isUsernameRequiredError(err: unknown): boolean {
  return err instanceof GundemApiError && err.code === 'USERNAME_REQUIRED';
}

/** Kullanım Şartları onayı olmayan hesap: sunucu 403 + `TERMS_REQUIRED` döner (lib/termsConsentGate.ts). */
export function isTermsRequiredError(err: unknown): boolean {
  return err instanceof GundemApiError && err.code === 'TERMS_REQUIRED';
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
  /**
   * Gönderir; hata fırlatırsa (GundemApiError) mesaj gösterilir, metin korunur. Başarıda alan temizlenir.
   * `entity`: "Ekle" ile seçilen oyuncu/takım/maç (yalnız gönderi varyantlarında; yorumda yok).
   */
  onSubmit: (body: string, entity?: GundemEntityRef) => Promise<unknown>;
  autoFocus?: boolean;
  /** Varsayılan yer tutucunun yerine (ör. maç forumu: "Maç hakkında ne düşünüyorsun?"). */
  placeholder?: string;
};

/**
 * Gönderi/yorum yazma alanı (paylaşımlı). Enter = yeni satır, Ctrl/Cmd+Enter = gönder.
 * Sayaç kalan karakteri gösterir; ≤ COUNTER_WARN_AT'de uyarı (amber) rengi.
 */
/**
 * Oturum durumu yüklenirken composer'ın yeri: ziyaretçi giriş çubuğuyla aynı sınıflar (görünmez) → yükseklik birebir;
 * son oturum açıksa (`html[data-auth-hint='in']`, bkz. utils/authHint.ts) daraltılmış satır içi composer yüksekliği.
 * Oturum gelince altındaki akış (yükleniyor yer tutucusu / kartlar) itilmez (CLS).
 */
export function PostComposerPlaceholder({ variant }: { variant: PostComposerVariant }) {
  const isInline = variant === 'post-inline';
  return (
    <div
      className={[styles.loginPrompt, isInline ? styles.loginInline : '', styles.placeholder, isInline ? styles.placeholderInline : '']
        .filter(Boolean)
        .join(' ')}
      aria-hidden="true"
    >
      &nbsp;
    </div>
  );
}

let mentionModule: Promise<ComponentType<MentionSuggestProps>> | null = null;
/** @etiket önerisi ilk odakta yüklenir (yerel import()): ana sayfa ilk yüküne girmez. */
function loadMentionSuggest() {
  mentionModule ??= import('@/components/Moderation/MentionSuggest').then((m) => m.default).catch((e) => {
    mentionModule = null;
    throw e;
  });
  return mentionModule;
}

let pickerModule: Promise<ComponentType<EntityPickerProps>> | null = null;
/** "Ekle" seçicisi ilk tıklamada yüklenir: ana sayfa ilk yüküne girmez. */
function loadEntityPicker() {
  pickerModule ??= import('./EntityPicker').then((m) => m.default).catch((e) => {
    pickerModule = null;
    throw e;
  });
  return pickerModule;
}

function AttachIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <path d="M12 9v6M9 12h6" />
    </svg>
  );
}

export default function PostComposer({ authenticated, variant, maxLength, onSubmit, autoFocus, placeholder }: PostComposerProps) {
  const { t } = useTranslation('gundem');
  const [value, setValue] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [needsUsername, setNeedsUsername] = useState(false);
  const [needsTerms, setNeedsTerms] = useState(false);
  const isInline = variant === 'post-inline';
  const isPost = variant !== 'comment';
  // Inline: `autoFocus` odak alıp açılmayı da tetikler (onFocus) — ilk render'da bile açık başlasın
  const [expanded, setExpanded] = useState(!isInline || !!autoFocus);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Gönderim sonrası odağı alana geri verirken yeniden açılmayı bastırır
  const skipExpandOnFocus = useRef(false);
  const [Mention, setMention] = useState<ComponentType<MentionSuggestProps> | null>(null);
  const [Picker, setPicker] = useState<ComponentType<EntityPickerProps> | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [entity, setEntity] = useState<PickedEntity | null>(null);
  const attachRef = useRef<HTMLButtonElement>(null);

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
    setNeedsUsername(false);
    setNeedsTerms(false);
    try {
      await onSubmit(value, entity ? { type: entity.type, id: entity.id } : undefined);
      setValue('');
      setEntity(null);
      setPickerOpen(false);
      if (isInline) {
        // Başarılı gönderim → tek satıra dön; "Paylaş" düğmesi kaybolacağı için odak alana döner (kaybolmaz)
        skipExpandOnFocus.current = true;
        setExpanded(false);
        textareaRef.current?.focus();
        skipExpandOnFocus.current = false;
      }
    } catch (err) {
      if (isUsernameRequiredError(err)) {
        setNeedsUsername(true);
        setError(t('composer.usernameRequired'));
      } else if (isTermsRequiredError(err)) {
        setNeedsTerms(true);
        setError(t('composer.termsRequired'));
      } else {
        setError(composerErrorMessage(err, t));
      }
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
    if (entity || pickerOpen) return; // ek seçiliyken / seçici açıkken küçülmez
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
          if (!Mention) void loadMentionSuggest().then((C) => setMention(() => C), () => undefined);
        }}
        placeholder={placeholderText}
        aria-label={placeholderText}
        data-expanded={isInline ? expanded : undefined}
        maxLength={maxLength}
        rows={collapsed ? 1 : isPost ? 3 : 2}
        autoFocus={autoFocus}
      />
      {Mention && !collapsed ? (
        <Mention
          textareaRef={textareaRef}
          value={value}
          onPick={(next, caret) => {
            setValue(next.slice(0, maxLength));
            requestAnimationFrame(() => textareaRef.current?.setSelectionRange(caret, caret));
          }}
        />
      ) : null}
      {collapsed ? null : (
        <>
          {isPost && entity ? (
            <div className={styles.attached}>
              <TeamLogo src={entity.image} width={18} alt="" className={styles.attachedImg} />
              <span className={styles.attachedKind}>{t(`entity.kind.${entity.type}`)}</span>
              <span className={styles.attachedLabel}>{entity.label}</span>
              <button
                type="button"
                className={styles.attachedRemove}
                onClick={() => {
                  setEntity(null);
                  textareaRef.current?.focus();
                }}
                aria-label={t('entity.remove')}
                title={t('entity.remove')}
              >
                ×
              </button>
            </div>
          ) : null}
          {isPost && pickerOpen && Picker ? (
            <Picker
              onPick={(picked) => {
                setEntity(picked);
                setPickerOpen(false);
                textareaRef.current?.focus();
              }}
              onClose={() => {
                setPickerOpen(false);
                attachRef.current?.focus();
              }}
            />
          ) : null}
          <div className={styles.bar}>
            {isPost ? (
              <button
                ref={attachRef}
                type="button"
                className={styles.attach}
                aria-expanded={pickerOpen}
                title={t('entity.attachTitle')}
                aria-label={t('entity.attachTitle')}
                onClick={() => {
                  if (pickerOpen) return setPickerOpen(false);
                  void loadEntityPicker().then(
                    (C) => {
                      setPicker(() => C);
                      setPickerOpen(true);
                    },
                    () => setError(t('entity.searchError')),
                  );
                }}
              >
                <AttachIcon />
                <span>{t('entity.attach')}</span>
              </button>
            ) : null}
            <span className={styles.hint}>{t('composer.hint')}</span>
            <Link href="/topluluk-kurallari" className={styles.rulesLink}>
              {t('composer.guidelines')}
            </Link>
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
              {needsUsername ? (
                <>
                  {' '}
                  <Link href={`/auth/choose-username?callbackUrl=${encodeURIComponent(window.location.pathname + window.location.search)}`}>
                    {t('composer.chooseUsername')}
                  </Link>
                </>
              ) : null}
              {needsTerms ? (
                <>
                  {' '}
                  <Link href={`/auth/onay?callbackUrl=${encodeURIComponent(window.location.pathname + window.location.search)}`}>
                    {t('composer.acceptTerms')}
                  </Link>
                </>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
