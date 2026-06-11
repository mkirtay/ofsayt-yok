import { useTranslation } from '@/lib/i18n';
import { useCallback, useEffect, useState } from 'react';
import Head from 'next/head';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { Role } from '@prisma/client';
import { useQueryClient } from '@tanstack/react-query';
import { PanelSkeleton } from '@/components/Skeleton';
import { profileQueryKey, useProfile } from '@/hooks/useProfile';
import styles from './profile.module.scss';

export default function ProfilePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t } = useTranslation('profile');
  const { data: session, status, update } = useSession();
  const { data: profile, isLoading: profileLoading } = useProfile(status === 'authenticated');

  const [saving, setSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [image, setImage] = useState('');
  const [email, setEmail] = useState('');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passSaving, setPassSaving] = useState(false);
  const [passMsg, setPassMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
    }
  }, [status, router]);

  useEffect(() => {
    if (!profile) return;
    setEmail(profile.email);
    setName(profile.name ?? '');
    setUsername(profile.username ?? '');
    setBio(profile.bio ?? '');
    setImage(profile.image ?? '');
  }, [profile]);

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
      setEmail(u.email);
      setName(u.name ?? '');
      setUsername(u.username ?? '');
      setBio(u.bio ?? '');
      setImage(u.image ?? '');
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

  const loading = status === 'loading' || profileLoading;

  if (loading) {
    return (
      <>
        <Head>
          <title>{t('pageTitle')}</title>
          <meta name="robots" content="noindex, nofollow" />
        </Head>
        <div className={styles.page}>
          <PanelSkeleton rows={6} />
          <PanelSkeleton rows={4} />
        </div>
      </>
    );
  }

  if (!session || !profile) {
    return null;
  }

  const isAdmin = profile.role === Role.ADMIN;

  return (
    <>
      <Head>
        <title>{t('pageTitle')}</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <div className={styles.page}>
        <h1 className={styles.title}>{t('title')}</h1>
        <p className={styles.subtitle}>
          <Link href="/">{t('backToHome')}</Link>
        </p>

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

          <div className={styles.field}>
            <label className={styles.label} htmlFor="image">
              {t('profileImage')}
            </label>
            <input
              id="image"
              className={styles.input}
              value={image}
              onChange={(e) => setImage(e.target.value)}
              placeholder={t('profileImagePlaceholder')}
            />
          </div>

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
      </div>
    </>
  );
}
