import { useCallback, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Role } from '@prisma/client';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '@/lib/i18n';
import { profileQueryKey, type ProfileDto } from '@/hooks/useProfile';
import AvatarPicker from './AvatarPicker';
import { galleryPathOf } from '@/lib/avatars';
import styles from './profile.module.scss';

/** "Bilgilerim": profil alanları + avatar + şifre değiştirme. */
export default function InfoTab({ profile }: { profile: ProfileDto }) {
  const queryClient = useQueryClient();
  const { t } = useTranslation('profile');
  const { update } = useSession();

  const [saving, setSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Sekme profil yüklendikten SONRA mount edilir → form alanları ilk değerlerini doğrudan profilden alır.
  const [name, setName] = useState(profile.name ?? '');
  const [username, setUsername] = useState(profile.username ?? '');
  const [bio, setBio] = useState(profile.bio ?? '');
  // API galeri avatarını tam URL döndürür; form/depolama göreli galeri yolunu kullanır.
  const [image, setImage] = useState(galleryPathOf(profile.image ?? '') ?? profile.image ?? '');
  const email = profile.email;

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passSaving, setPassSaving] = useState(false);
  const [passMsg, setPassMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const refreshProfile = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: profileQueryKey });
  }, [queryClient]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileMsg(null);
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
        setProfileMsg({ type: 'err', text: data.error || t('saveError') });
        return;
      }
      const u = data.user ?? data;
      setName(u.name ?? '');
      setUsername(u.username ?? '');
      setBio(u.bio ?? '');
      setImage(galleryPathOf(u.image ?? '') ?? u.image ?? '');
      await update({
        name: u.name,
        image: u.image,
        username: u.username,
      });
      void refreshProfile();
      setProfileMsg({ type: 'ok', text: t('saved') });
    } catch {
      setProfileMsg({ type: 'err', text: t('connectionError') });
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPassMsg(null);
    if (newPassword !== confirmPassword) {
      setPassMsg({ type: 'err', text: t('passwordMismatch') });
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
        setPassMsg({ type: 'err', text: data.error || t('passwordChangeError') });
        return;
      }
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPassMsg({ type: 'ok', text: t('passwordChanged') });
    } catch {
      setPassMsg({ type: 'err', text: t('connectionError') });
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

          <AvatarPicker value={image} onChange={setImage} name={name || username || email} />

          <div className={styles.field}>
            <span className={styles.label}>{t('role')}</span>
            <span
              className={`${styles.roleBadge} ${isAdmin ? styles.roleAdmin : ''}`.trim()}
            >
              {isAdmin ? t('roleAdmin') : t('roleMember')}
            </span>
          </div>

          <div className={styles.actions}>
            <button type="submit" className={styles.submit} disabled={saving}>
              {saving ? t('saving') : t('save')}
            </button>
          </div>
          {profileMsg && (
            <p className={`${styles.message} ${profileMsg.type === 'ok' ? styles.ok : styles.err}`}>
              {profileMsg.text}
            </p>
          )}
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
            <button type="submit" className={styles.submit} disabled={passSaving}>
              {passSaving ? t('updating') : t('updatePassword')}
            </button>
          </div>
          {passMsg && (
            <p className={`${styles.message} ${passMsg.type === 'ok' ? styles.ok : styles.err}`}>
              {passMsg.text}
            </p>
          )}
        </form>
    </>
  );
}
