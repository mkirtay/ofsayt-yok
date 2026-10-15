import { useCallback, useState } from 'react';
import { signIn, useSession } from 'next-auth/react';
import { Role } from '@prisma/client';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '@/lib/i18n';
import '@/lib/i18nNamespaces/profile';
import { profileQueryKey, type ProfileDto } from '@/hooks/useProfile';
import AvatarPicker from './AvatarPicker';
import { useToast } from '@/components/Toast';
import DeleteAccountSection from './DeleteAccountSection';
import { galleryPathOf } from '@/lib/avatars';
import styles from './profile.module.scss';

/**
 * "Bilgilerim": profil alanları + avatar + şifre değiştirme + hesap silme.
 * Kaydet geri bildirimi: başarıda "Kaydedildi", hatada sunucunun iletisi — kısa, kendiliğinden kapanan, aria-live ile
 * duyurulan toast (components/Toast). Düğme kaydederken pasif + "Kaydediliyor…" (aria-busy); değişiklik yoksa pasif.
 */
export default function InfoTab({ profile }: { profile: ProfileDto }) {
  const queryClient = useQueryClient();
  const { t } = useTranslation('profile');
  const { update } = useSession();

  const [saving, setSaving] = useState(false);
  const { show, toastNode } = useToast(t('toastClose'));

  // Sekme profil yüklendikten SONRA mount edilir → form alanları ilk değerlerini doğrudan profilden alır.
  const [name, setName] = useState(profile.name ?? '');
  const [username, setUsername] = useState(profile.username ?? '');
  const [bio, setBio] = useState(profile.bio ?? '');
  // API galeri avatarını tam URL döndürür; form/depolama göreli galeri yolunu kullanır.
  const [image, setImage] = useState(galleryPathOf(profile.image ?? '') ?? profile.image ?? '');
  const email = profile.email;
  // Son kaydedilen değerler: form bunlardan farklı değilse Kaydet pasif.
  const [baseline, setBaseline] = useState({ name, username, bio, image });
  const dirty = name !== baseline.name || username !== baseline.username || bio !== baseline.bio || image !== baseline.image;

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passSaving, setPassSaving] = useState(false);
  const passReady = currentPassword.length > 0 && newPassword.length > 0 && confirmPassword.length > 0;

  const refreshProfile = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: profileQueryKey });
  }, [queryClient]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dirty || saving) return;
    setSaving(true);
    try {
      const res = await fetch('/api/user/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name, username, bio, image }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        show('error', data.code === 'CONTENT_REJECTED' ? t('contentRejected') : data.error || t('saveError'));
        return;
      }
      const u = data.user ?? data;
      const next = {
        name: u.name ?? '',
        username: u.username ?? '',
        bio: u.bio ?? '',
        image: galleryPathOf(u.image ?? '') ?? u.image ?? '',
      };
      setName(next.name);
      setUsername(next.username);
      setBio(next.bio);
      setImage(next.image);
      setBaseline(next);
      // Önbellek hemen güncel (başlık kartı, sekme yeniden takılırsa form eski değere dönmesin).
      queryClient.setQueryData<ProfileDto>(profileQueryKey, (old) => (old ? { ...old, ...u } : old));
      await update({
        name: u.name,
        image: u.image,
        username: u.username,
      });
      void refreshProfile();
      show('success', t('saved'));
    } catch {
      show('error', t('connectionError'));
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passReady || passSaving) return;
    if (newPassword !== confirmPassword) {
      show('error', t('passwordMismatch'));
      return;
    }
    setPassSaving(true);
    try {
      const res = await fetch('/api/user/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        show('error', data.error || t('passwordChangeError'));
        return;
      }
      // Şifre değişince tüm oturumlar (bu dahil) geçersiz → yeni şifreyle hemen yeniden giriş; olmazsa giriş sayfası.
      const relogin = await signIn('credentials', { redirect: false, identifier: email, password: newPassword });
      if (!relogin?.ok || relogin.error) {
        window.location.href = `/auth/signin?callbackUrl=${encodeURIComponent('/profile')}`;
        return;
      }
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      show('success', t('passwordChanged'));
    } catch {
      show('error', t('connectionError'));
    } finally {
      setPassSaving(false);
    }
  };

  const isAdmin = profile.role === Role.ADMIN;

  return (
    <>
        <form className={styles.section} onSubmit={handleSaveProfile}>
          <h2 className={styles.sectionTitle}>{t('myInfo')}</h2>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="email">
              {t('email')}
            </label>
            <input id="email" className={`${styles.input} ${styles.readonly}`} value={email} disabled />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="name">
              {t('name')}
            </label>
            <input
              id="name"
              className={styles.input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="username">
              {t('username')}
            </label>
            <input
              id="username"
              className={styles.input}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={t('usernamePlaceholder')}
              maxLength={30}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="bio">
              {t('bio')}
            </label>
            <textarea
              id="bio"
              className={styles.textarea}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={2000}
            />
          </div>

          {/* Avatar seçici katlanır: form kısa kalır, başlık kartında güncel avatar zaten görünüyor. */}
          <details className={styles.avatarDetails}>
            <summary>{t('avatarToggle')}</summary>
            <AvatarPicker value={image} onChange={setImage} name={name || username || email} />
          </details>

          <div className={styles.field}>
            <span className={styles.label}>{t('role')}</span>
            <span
              className={`${styles.roleBadge} ${isAdmin ? styles.roleAdmin : ''}`.trim()}
            >
              {isAdmin ? t('roleAdmin') : t('roleMember')}
            </span>
          </div>

          <div className={styles.actions}>
            <button type="submit" className={styles.submit} disabled={saving || !dirty} aria-busy={saving || undefined}>
              {saving ? t('saving') : t('save')}
            </button>
          </div>
        </form>

        <form className={styles.section} onSubmit={handleChangePassword}>
          <h2 className={styles.sectionTitle}>{t('changePassword')}</h2>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="currentPassword">
              {t('currentPassword')}
            </label>
            <input
              id="currentPassword"
              type="password"
              className={styles.input}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="newPassword">
              {t('newPassword')}
            </label>
            <input
              id="newPassword"
              type="password"
              className={styles.input}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="confirmPassword">
              {t('confirmPassword')}
            </label>
            <input
              id="confirmPassword"
              type="password"
              className={styles.input}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>

          <div className={styles.actions}>
            <button type="submit" className={styles.submit} disabled={passSaving || !passReady} aria-busy={passSaving || undefined}>
              {passSaving ? t('updating') : t('updatePassword')}
            </button>
          </div>
        </form>

        <DeleteAccountSection email={email} />
        {toastNode}
    </>
  );
}
