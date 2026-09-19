import { useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { useTranslation } from '@/lib/i18n';
import { PanelSkeleton } from '@/components/Skeleton';
import { useProfile } from '@/hooks/useProfile';
import { PROFILE_TABS, resolveProfileTab } from '@/components/Profile/profileTabs';
import styles from '@/components/Profile/profile.module.scss';

export default function ProfilePage() {
  const router = useRouter();
  const { t } = useTranslation('profile');
  const { status } = useSession();
  const { data: profile, isLoading: profileLoading } = useProfile(status === 'authenticated');
  const activeId = resolveProfileTab(router.query.tab);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
    }
  }, [status, router]);

  // Sekme geçişi istemci tarafında (shallow) — sayfa yenilenmez; `?tab=` ile derin bağlantı çalışır.
  const selectTab = (id: string) => {
    void router.replace({ pathname: router.pathname, query: id === PROFILE_TABS[0].id ? {} : { tab: id } }, undefined, { shallow: true });
  };

  const head = (
    <Head>
      <title>{t('pageTitle')}</title>
      <meta name="robots" content="noindex, nofollow" />
    </Head>
  );

  if (status === 'loading' || profileLoading) {
    return (
      <>
        {head}
        <div className={styles.page}>
          <PanelSkeleton rows={6} />
          <PanelSkeleton rows={4} />
        </div>
      </>
    );
  }

  if (status !== 'authenticated' || !profile) return null;

  const active = PROFILE_TABS.find((tab) => tab.id === activeId) ?? PROFILE_TABS[0];

  return (
    <>
      {head}
      <div className={styles.page}>
        <h1 className={styles.title}>{t('title')}</h1>
        <p className={styles.subtitle}>
          <Link href="/">{t('backToHome')}</Link>
        </p>

        <div className={styles.tabs} role="tablist" aria-label={t('title')}>
          {PROFILE_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`profile-tab-${tab.id}`}
              aria-selected={tab.id === active.id}
              aria-controls={`profile-panel-${tab.id}`}
              className={`${styles.chip} ${tab.id === active.id ? styles.chipActive : ''}`.trim()}
              onClick={() => selectTab(tab.id)}
            >
              {t(tab.labelKey)}
            </button>
          ))}
        </div>

        <div role="tabpanel" id={`profile-panel-${active.id}`} aria-labelledby={`profile-tab-${active.id}`}>
          <active.Component profile={profile} />
        </div>
      </div>
    </>
  );
}
