import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useSession, signOut } from 'next-auth/react';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { prefetchAiStatsDashboard } from '@/hooks/useAiStatsDashboard';
import { prefetchHomeHubMatches } from '@/hooks/useHomeHubMatches';
import { todayIsoIstanbul } from '@/utils/dateStrip';
import { prefetchProfile } from '@/hooks/useProfile';
import { useTranslation, useI18n } from '@/lib/i18n';
import { useCredits } from '@/hooks/useCredits';
import Container from '../Container';
import HeaderButton from '../HeaderButton';
import HeaderSearch from '../HeaderSearch';
import ThemeToggle from '../ThemeToggle';
import LangFlag from '../LangFlag';
import MyAnalysesDropdown from './MyAnalysesDropdown';
import AiMenu from './AiMenu';
import AccountMenu from './AccountMenu';
import NotificationBell from './NotificationBell';
import { OPEN_MENU_EVENT } from '@/utils/bottomNav';
import { lockBodyScroll } from '@/utils/scrollLock';
import { MOBILE_LAYOUT_QUERY } from '@/config/breakpoints';
import styles from './header.module.scss';

export default function Header() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: session, status: sessionStatus } = useSession();
  const sessionLoading = sessionStatus === 'loading';
  const { credits, authenticated: hasCredits } = useCredits();
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

  const menuRef = useRef<HTMLDivElement>(null);
  const hamburgerRef = useRef<HTMLButtonElement>(null);

  // Rota veya query değişince (alt nav sekmeleri aynı sayfada query değiştirir) menü kapansın
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [router.asPath]);

  // Menü açıkken arka plan scroll kilidi — kapanışta (X, dışarı tık, Esc, rota, resize) eksiksiz geri alınır
  useEffect(() => {
    if (!mobileMenuOpen) return;
    const unlock = lockBodyScroll();
    const close = () => setMobileMenuOpen(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    const onDown = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || hamburgerRef.current?.contains(t)) return;
      // Alt navdaki "Diğer" kendi toggle'ını yönetir (çift tetiklenmesin)
      if ((t as Element).closest?.('[data-menu-toggle]')) return;
      close();
    };
    // Masaüstü genişliğine geçilirse menü artık anlamsız — kapat
    const mql = window.matchMedia(MOBILE_LAYOUT_QUERY);
    const onMql = () => {
      if (!mql.matches) close();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    mql.addEventListener('change', onMql);
    return () => {
      unlock();
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      mql.removeEventListener('change', onMql);
    };
  }, [mobileMenuOpen]);

  // Alt navigasyondaki "Diğer" sekmesi mobil menüyü açar/kapatır
  useEffect(() => {
    const onToggle = () => setMobileMenuOpen((v) => !v);
    window.addEventListener(OPEN_MENU_EVENT, onToggle);
    return () => window.removeEventListener(OPEN_MENU_EVENT, onToggle);
  }, []);

  // Bayrak, tıklayınca geçilecek dili gösterir (önceki "EN/TR" metniyle aynı anlam)
  const targetLang = locale === 'tr' ? 'en' : 'tr';

  function toggleLang() {
    setLocale(targetLang);
  }

  const prefetchAiStats = useCallback(() => {
    if (session?.user) {
      void prefetchAiStatsDashboard(queryClient);
    }
  }, [queryClient, session?.user]);

  const prefetchHome = useCallback(() => {
    const today = todayIsoIstanbul();
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
        </div>
        <HeaderSearch />
        <div className={styles.right}>
          <div className={styles.headerNavPills}>
            {isWorldCupTheme && (
              <Link
                href="/world-cup"
                className={styles.worldCupMarkLink}
                aria-label="FIFA World Cup"
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
            )}
            <AiMenu />
            <Link href="/credits" className={styles.headerNavPillPremium}>
              {hasCredits ? `${credits} ⚡` : t('credits')}
            </Link>
          </div>
        </div>
        <div className={styles.actions}>
          <Link
            href="/gundem"
            className={`${styles.headerNavPill} ${router.pathname.startsWith('/gundem') ? styles.headerNavPillActive : ''}`.trim()}
            aria-current={router.pathname.startsWith('/gundem') ? 'page' : undefined}
          >
            {t('gundem')}
          </Link>
          <span className={styles.divider} aria-hidden="true" />
          {sessionLoading ? (
            // Oturum durumu netleşene kadar "Giriş Yap/Üye Ol" ya da "Profil" gibi
            // yanlış olabilecek bir state göstermek yerine nötr bir placeholder gösteriyoruz.
            // Bu, sayfa her yüklendiğinde header'ın "titremesini" (auth flicker) önler.
            <div className={styles.authPlaceholder} aria-hidden="true" />
          ) : session ? (
            <>
              <NotificationBell />
              <AccountMenu />
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
          <ThemeToggle />
          <button
            type="button"
            className={styles.langToggle}
            onClick={toggleLang}
            aria-label={t('langSwitchLabel')}
            title={t('langSwitchLabel')}
          >
            <LangFlag lang={targetLang} className={styles.flag} />
          </button>
        </div>
        {session ? <NotificationBell className={styles.mobileBell} /> : null}
        <ThemeToggle className={styles.mobileThemeToggle} />
        <button
          ref={hamburgerRef}
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
        <div ref={menuRef} className={`${styles.mobileMenu} ${isWorldCupTheme ? styles.mobileMenuWorldCup : ''}`}>
          <HeaderSearch onNavigate={() => setMobileMenuOpen(false)} />
          <nav className={styles.mobileNav}>
            <Link
              href="/ai-istatistikleri"
              className={styles.mobileNavLink}
              onMouseEnter={prefetchAiStats}
              onFocus={prefetchAiStats}
            >
              {t('aiAccuracy')}
            </Link>
            {session && <MyAnalysesDropdown />}
            <Link href="/credits" className={styles.mobileNavLinkPremium}>
              {hasCredits ? `${credits} ⚡ ${t('credits')}` : t('credits')}
            </Link>
          </nav>
          <div className={styles.mobileActions}>
            {sessionLoading ? (
              <div className={styles.authPlaceholderMobile} aria-hidden="true" />
            ) : session ? (
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
              aria-label={t('langSwitchLabel')}
            >
              <LangFlag lang={targetLang} className={styles.flag} />
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
