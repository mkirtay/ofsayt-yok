import { useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { useTranslation } from '@/lib/i18n';
import '@/lib/i18nNamespaces/profile';
import { PanelSkeleton } from '@/components/Skeleton';
import { useProfile } from '@/hooks/useProfile';
import { useProfileSummary } from '@/hooks/useProfileSummary';
import ProfileHeaderCard from '@/components/Profile/ProfileHeaderCard';
import { PROFILE_TABS, resolveProfileTab } from '@/components/Profile/profileTabs';
import styles from '@/components/Profile/profile.module.scss';

export default function ProfilePage() {
  const router = useRouter();
  const { t } = useTranslation('profile');
  const { status } = useSession();
  const { data: profile, isLoading: profileLoading } = useProfile(status === 'authenticated');
  const { data: summary } = useProfileSummary(status === 'authenticated');
  const activeId = resolveProfileTab(router.query.tab);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
    }
  }, [status, router]);

  // Sekme geçişi istemci tarafında (shallow) — sayfa yenilenmez; `?tab=` ile derin bağlantı çalışır.
  const selectTab = (id: string) =>
    router.replace({ pathname: router.pathname, query: id === PROFILE_TABS[0].id ? {} : { tab: id } }, undefined, { shallow: true });

  // "Profili düzenle": ayrı akış yok — Bilgilerim sekmesine geçip ilk alana (İsim) odaklanır.
  const editProfile = async () => {
    if (resolveProfileTab(router.query.tab) !== PROFILE_TABS[0].id) await selectTab(PROFILE_TABS[0].id);
    requestAnimationFrame(() => {
      const input = document.getElementById('name');
      input?.scrollIntoView({ block: 'center' });
      input?.focus();
    });
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
        {/* Son düzenle aynı iskelet: başlık kartı yeri (sabit yükseklik) + sekme içeriği. */}
        <div className={styles.page}>
          <div className={styles.layout}>
            <aside className={styles.aside}>
              <div className={`${styles.headerCard} ${styles.headerCardSkeleton}`} aria-hidden="true" />
            </aside>
            <div className={styles.main}>
              <PanelSkeleton rows={6} />
            </div>
          </div>
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
        <div className={styles.layout}>
          <aside className={styles.aside}>
            <ProfileHeaderCard profile={profile} summary={summary ?? null} onEdit={() => void editProfile()} />
            <div className={styles.tabs} role="tablist" aria-label={t('title')} aria-orientation="vertical">
              {PROFILE_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  id={`profile-tab-${tab.id}`}
                  aria-selected={tab.id === active.id}
                  aria-controls={`profile-panel-${tab.id}`}
                  className={`${styles.chip} ${tab.id === active.id ? styles.chipActive : ''}`.trim()}
                  onClick={() => void selectTab(tab.id)}
                >
                  {t(tab.labelKey)}
                </button>
              ))}
            </div>
          </aside>

          <div
            className={styles.main}
            role="tabpanel"
            id={`profile-panel-${active.id}`}
            aria-labelledby={`profile-tab-${active.id}`}
          >
            <active.Component profile={profile} />
          </div>
        </div>
      </div>
    </>
  );
}
