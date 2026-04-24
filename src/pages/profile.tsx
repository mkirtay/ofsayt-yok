import type { GetServerSideProps, InferGetServerSidePropsType } from 'next';
import { useCallback, useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { Role } from '@prisma/client';
import type { ProfilePageServerPayload } from '@/server/loadProfilePageData';
import { loadProfilePageData } from '@/server/loadProfilePageData';
import { propsJsonSafe } from '@/server/propsJsonSafe';
import styles from './profile.module.scss';

type ProfileDto = ProfilePageServerPayload;

type ProfilePageProps = {
  initialProfile: ProfilePageServerPayload;
};

export default function ProfilePage({
  initialProfile,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();
  const { data: session, status, update } = useSession();

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [name, setName] = useState(() => initialProfile.name ?? '');
  const [username, setUsername] = useState(() => initialProfile.username ?? '');
  const [bio, setBio] = useState(() => initialProfile.bio ?? '');
  const [image, setImage] = useState(() => initialProfile.image ?? '');
  const [email, setEmail] = useState(() => initialProfile.email);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passSaving, setPassSaving] = useState(false);
  const [passMsg, setPassMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/user/me', { credentials: 'include' });
      if (!res.ok) {
        if (res.status === 401) router.push('/auth/signin');
        return;
      }
      const data = (await res.json()) as ProfileDto;
      setEmail(data.email);
      setName(data.name ?? '');
      setUsername(data.username ?? '');
      setBio(data.bio ?? '');
      setImage(data.image ?? '');
    } finally {
      setLoading(false);
    }
  }, [router]);

  const skipInitialProfileFetch = useRef(true);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
      return;
    }
    if (status !== 'authenticated') return;
    if (skipInitialProfileFetch.current) {
      skipInitialProfileFetch.current = false;
      return;
    }
    void loadProfile();
  }, [status, router, loadProfile]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileMsg(null);
    setSaving(true);
    try {
      const res = await fetch('/api/user/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: name.trim() || null,
          username: username.trim() || null,
          bio: bio.trim() || null,
          image: image.trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setProfileMsg({ type: 'err', text: data.error || 'Kaydedilemedi.' });
        return;
      }
      const u = data as ProfileDto;
      setName(u.name ?? '');
      setUsername(u.username ?? '');
      setBio(u.bio ?? '');
      setImage(u.image ?? '');
      await update({
        name: u.name,
        image: u.image,
        username: u.username,
      });
      setProfileMsg({ type: 'ok', text: 'Profil güncellendi.' });
    } catch {
      setProfileMsg({ type: 'err', text: 'Bağlantı hatası.' });
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPassMsg(null);
    if (newPassword !== confirmPassword) {
      setPassMsg({ type: 'err', text: 'Yeni şifreler eşleşmiyor.' });
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
        setPassMsg({ type: 'err', text: data.error || 'Şifre değiştirilemedi.' });
        return;
      }
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPassMsg({ type: 'ok', text: 'Şifre güncellendi.' });
    } catch {
      setPassMsg({ type: 'err', text: 'Bağlantı hatası.' });
    } finally {
      setPassSaving(false);
    }
  };

  if (status === 'loading' || loading) {
    return (
      <div className={styles.page}>
        <p className={styles.subtitle}>Yükleniyor…</p>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  return (
    <>
      <Head>
        <title>Profil — Ofsayt Yok</title>
      </Head>
      <div className={styles.page}>
        <h1 className={styles.title}>Profil</h1>
        <p className={styles.subtitle}>
          <Link href="/">Ana sayfaya dön</Link>
        </p>

        <form className={styles.section} onSubmit={handleSaveProfile}>
          <h2 className={styles.sectionTitle}>Bilgilerim</h2>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="email">
              E-posta
            </label>
            <input id="email" className={`${styles.input} ${styles.readonly}`} value={email} disabled />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="name">
              İsim
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
              Kullanıcı adı
            </label>
            <input
              id="username"
              className={styles.input}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="3–30 karakter, harf rakam _"
              maxLength={30}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="bio">
              Hakkımda
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
              Profil görseli (URL)
            </label>
            <input
              id="image"
              className={styles.input}
              value={image}
              onChange={(e) => setImage(e.target.value)}
              placeholder="https://…"
            />
          </div>

          <div className={styles.field}>
            <span className={styles.label}>Rol</span>
            <span
              className={`${styles.roleBadge} ${session.user.role === Role.ADMIN ? styles.roleAdmin : ''}`.trim()}
            >
              {session.user.role === Role.ADMIN ? 'Yönetici' : 'Üye'}
            </span>
          </div>

          <div className={styles.actions}>
            <button type="submit" className={styles.submit} disabled={saving}>
              {saving ? 'Kaydediliyor…' : 'Kaydet'}
            </button>
          </div>
          {profileMsg && (
            <p className={`${styles.message} ${profileMsg.type === 'ok' ? styles.ok : styles.err}`}>
              {profileMsg.text}
            </p>
          )}
        </form>

        <form className={styles.section} onSubmit={handleChangePassword}>
          <h2 className={styles.sectionTitle}>Şifre değiştir</h2>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="currentPassword">
              Mevcut şifre
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
              Yeni şifre
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
              Yeni şifre (tekrar)
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
              {passSaving ? 'Güncelleniyor…' : 'Şifreyi güncelle'}
            </button>
          </div>
          {passMsg && (
            <p className={`${styles.message} ${passMsg.type === 'ok' ? styles.ok : styles.err}`}>{passMsg.text}</p>
          )}
        </form>
      </div>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<ProfilePageProps> = async (ctx) => {
  ctx.res.setHeader('Cache-Control', 'private, no-store');
  const profile = await loadProfilePageData(ctx);
  if (!profile) {
    return {
      redirect: { destination: '/auth/signin', permanent: false },
    };
  }
  return {
    props: {
      initialProfile: propsJsonSafe(profile),
    },
  };
};
