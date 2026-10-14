import { useId, useState } from 'react';
import { signOut } from 'next-auth/react';
import { useTranslation } from '@/lib/i18n';
import '@/lib/i18nNamespaces/profile';
import { DELETE_CONFIRM_WORD, isDeletionConfirmed } from '@/lib/accountDeletion';
import styles from './profile.module.scss';

/**
 * "Hesabımı sil": iki adım — önce ne olacağı açıklanır, sonra e-posta adresi ya da "SİL" yazılarak onaylanır (Google ile
 * girenlerde de aynı; şifre istenmez). Sunucu aynı kuralı yeniden denetler (DELETE /api/user/me). Başarıda oturum
 * kapatılır (sunucuda zaten geçersiz) ve ana sayfaya dönülür.
 */
export default function DeleteAccountSection({ email }: { email: string }) {
  const { t } = useTranslation('profile');
  const inputId = useId();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  const confirmed = isDeletionConfirmed(confirm, email);

  const handleDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmed || deleting) return;
    setError('');
    setDeleting(true);
    try {
      const res = await fetch('/api/user/me', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ confirm }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error || t('deleteAccount.error'));
        setDeleting(false);
        return;
      }
      await signOut({ callbackUrl: '/' });
    } catch {
      setError(t('connectionError'));
      setDeleting(false);
    }
  };

  return (
    <section className={`${styles.section} ${styles.dangerSection}`} aria-labelledby={`${inputId}-title`}>
      <h2 id={`${inputId}-title`} className={styles.sectionTitle}>
        {t('deleteAccount.title')}
      </h2>
      <p className={styles.hint}>{t('deleteAccount.intro')}</p>

      {!open ? (
        <div className={styles.actions}>
          <button type="button" className={styles.dangerOutline} onClick={() => setOpen(true)}>
            {t('deleteAccount.start')}
          </button>
        </div>
      ) : (
        <form onSubmit={handleDelete}>
          <ul className={styles.dangerList}>
            <li>{t('deleteAccount.effects.account')}</li>
            <li>{t('deleteAccount.effects.credits')}</li>
            <li>{t('deleteAccount.effects.posts')}</li>
            <li>{t('deleteAccount.effects.orders')}</li>
            <li>{t('deleteAccount.effects.irreversible')}</li>
          </ul>
          <div className={styles.field}>
            <label className={styles.label} htmlFor={inputId}>
              {t('deleteAccount.confirmLabel', { word: DELETE_CONFIRM_WORD })}
            </label>
            <input
              id={inputId}
              className={styles.input}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={320}
            />
          </div>
          <div className={`${styles.actions} ${styles.dangerActions}`}>
            <button type="submit" className={styles.danger} disabled={!confirmed || deleting}>
              {deleting ? t('deleteAccount.deleting') : t('deleteAccount.submit')}
            </button>
            <button
              type="button"
              className={styles.dangerCancel}
              onClick={() => {
                setOpen(false);
                setConfirm('');
                setError('');
              }}
              disabled={deleting}
            >
              {t('deleteAccount.cancel')}
            </button>
          </div>
          {error ? (
            <p className={`${styles.message} ${styles.err}`} role="alert">
              {error}
            </p>
          ) : null}
        </form>
      )}
    </section>
  );
}
