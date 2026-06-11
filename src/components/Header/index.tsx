import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useSession, signOut } from 'next-auth/react';
import { useState, useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { prefetchWorldCupBootstrap } from '@/hooks/useWorldCupBootstrap';
import { prefetchUefaHubMatches } from '@/hooks/useUefaHubMatches';
import { prefetchAiStatsDashboard } from '@/hooks/useAiStatsDashboard';
import { prefetchHomeHubMatches } from '@/hooks/useHomeHubMatches';
import { prefetchProfile } from '@/hooks/useProfile';
import { UEFA_CHAMPIONS_LEAGUE_ID } from '@/config/leagues';
import { useTranslation, useI18n } from '@/lib/i18n';
import Container from '../Container';
import HeaderButton from '../HeaderButton';
import styles from './header.module.scss';

export default function Header() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const { t } = useTranslation('nav');
  const { locale, setLocale } = useI18n();
  const isWorldCupRoute = router.pathname.startsWith('/world-cup');
  const [bodyHasWcHeader, setBodyHasWcHeader] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const sync = () => {
      setBodyHasWcHeader(
        document.body.classList.contains('worldCupHeaderOnly') ||
          document.body.classList.contains('worldCupTheme'),
      );
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  const isWorldCupTheme = isWorldCupRoute || bodyHasWcHeader;

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [router.pathname]);

  function toggleLang() {
    setLocale(locale === 'tr' ? 'en' : 'tr');
  }

  const prefetchWorldCup = useCallback(() => {
    void prefetchWorldCupBootstrap(queryClient);
  }, [queryClient]);

  const prefetchUefa = useCallback(() => {
    void prefetchUefaHubMatches(queryClient, UEFA_CHAMPIONS_LEAGUE_ID);
  }, [queryClient]);

  const prefetchAiStats = useCallback(() => {
    if (session?.user) {
      void prefetchAiStatsDashboard(queryClient);
    }
  }, [queryClient, session?.user]);

  const prefetchHome = useCallback(() => {
    const today = new Date().toISOString().slice(0, 10);
    void prefetchHomeHubMatches(queryClient, today);
  }, [queryClient]);

  const prefetchProfilePage = useCallback(() => {
    if (session?.user) {
      void prefetchProfile(queryClient);
    }
  }, [queryClient, session?.user]);

  return (
    <header className={`${styles.header} ${isWorldCupTheme ? styles.headerWorldCup : ''}`.trim()}>
      <Container className={styles.headerContainer}>
        <div className={styles.left}>
          <div className={styles.logo}>
            <Link href="/" className={styles.logoLink} onMouseEnter={prefetchHome} onFocus={prefetchHome}>
              <Image
                src={isWorldCupTheme ? '/images/logo-black.svg' : '/images/logo.svg'}
                alt="Ofsayt Yok"
                width={146}
                height={28}
                priority
              />
            </Link>
          </div>
          <div className={styles.headerNavPills}>
            {isWorldCupTheme ? (
              <Link
                href="/world-cup"
                className={styles.worldCupMarkLink}
                aria-label="FIFA World Cup"
                onMouseEnter={prefetchWorldCup}
                onFocus={prefetchWorldCup}
              >
                <Image
                  src="/images/2026_FIFA_World_Cup_Logo.png"
                  alt="FIFA World Cup"
                  width={28}
                  height={42}
                  className={styles.worldCupMark}
                  priority
                />
              </Link>
            ) : (
              <Link
                href="/world-cup"
                className={styles.headerNavPill}
                onMouseEnter={prefetchWorldCup}
                onFocus={prefetchWorldCup}
              >
                {t('worldCup')}
              </Link>
            )}
            <Link
              href="/uefa"
              className={styles.headerNavPill}
              onMouseEnter={prefetchUefa}
              onFocus={prefetchUefa}
            >
              {t('uefa')}
            </Link>
            <Link
              href="/ai-istatistikleri"
              className={styles.headerNavPill}
              onMouseEnter={prefetchAiStats}
              onFocus={prefetchAiStats}
            >
              {t('aiAccuracy')}
            </Link>
            <Link href="/premium" className={styles.headerNavPillPremium}>
              {t('premium')}
            </Link>
          </div>
        </div>
        <div className={styles.actions}>
          {session ? (
            <>
              <Link
                href="/profile"
                className={styles.profileLink}
                onMouseEnter={prefetchProfilePage}
                onFocus={prefetchProfilePage}
              >
                {t('profile')}
              </Link>
              <span className={styles.userName}>
                {session.user.username || session.user.name || session.user.email}
              </span>
              <HeaderButton variant="outline" onClick={() => signOut()}>
                {t('signOut')}
              </HeaderButton>
            </>
          ) : (
            <>
              <HeaderButton variant="outline" onClick={() => router.push('/auth/signin')}>
                {t('signIn')}
              </HeaderButton>
              <HeaderButton variant="filled" onClick={() => router.push('/auth/signup')}>
                {t('signUp')}
              </HeaderButton>
            </>
          )}
          <button
            type="button"
            className={styles.langToggle}
            onClick={toggleLang}
            aria-label={t('langSwitch')}
          >
            {t('langSwitch')}
          </button>
        </div>
        <button
          className={`${styles.hamburger} ${mobileMenuOpen ? styles.hamburgerOpen : ''}`}
          onClick={() => setMobileMenuOpen((v) => !v)}
          aria-label={t('toggleMenu')}
          aria-expanded={mobileMenuOpen}
        >
          <span />
          <span />
          <span />
        </button>
      </Container>

      {mobileMenuOpen && (
        <div className={`${styles.mobileMenu} ${isWorldCupTheme ? styles.mobileMenuWorldCup : ''}`}>
          <nav className={styles.mobileNav}>
            {!isWorldCupTheme && (
              <Link
                href="/world-cup"
                className={styles.mobileNavLink}
                onMouseEnter={prefetchWorldCup}
                onFocus={prefetchWorldCup}
              >
                {t('worldCup')}
              </Link>
            )}
            <Link
              href="/uefa"
              className={styles.mobileNavLink}
              onMouseEnter={prefetchUefa}
              onFocus={prefetchUefa}
            >
              {t('uefa')}
            </Link>
            <Link
              href="/ai-istatistikleri"
              className={styles.mobileNavLink}
              onMouseEnter={prefetchAiStats}
              onFocus={prefetchAiStats}
            >
              {t('aiAccuracy')}
            </Link>
            <Link href="/premium" className={styles.mobileNavLinkPremium}>
              {t('premium')}
            </Link>
          </nav>
          <div className={styles.mobileActions}>
            {session ? (
              <>
                <Link
                  href="/profile"
                  className={styles.mobileNavLink}
                  onMouseEnter={prefetchProfilePage}
                  onFocus={prefetchProfilePage}
                >
                  {t('profile')}
                </Link>
                <button className={styles.mobileSignOut} onClick={() => signOut()}>
                  {t('signOut')}
                </button>
              </>
            ) : (
              <>
                <Link href="/auth/signin" className={styles.mobileAuthOutline}>
                  {t('signIn')}
                </Link>
                <Link href="/auth/signup" className={styles.mobileAuthFilled}>
                  {t('signUp')}
                </Link>
              </>
            )}
            <button
              type="button"
              className={styles.mobileLangToggle}
              onClick={toggleLang}
            >
              {t('langSwitch')}
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
