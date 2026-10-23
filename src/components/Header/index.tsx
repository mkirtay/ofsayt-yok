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
import { trackFrikik } from '@/lib/frikik/analytics';
import { useCredits } from '@/hooks/useCredits';
import Container from '../Container';
import { AUTH_HINT_SCRIPT, writeAuthHint } from '@/utils/authHint';
import HeaderSearch from '../HeaderSearch';
import ThemeToggle from '../ThemeToggle';
import LangFlag from '../LangFlag';
import MyAnalysesDropdown from './MyAnalysesDropdown';
import AiMenu from './AiMenu';
import AccountMenu from './AccountMenu';
import NotificationBell from './NotificationBell';
import { lockBodyScroll } from '@/utils/scrollLock';
import { MOBILE_LAYOUT_QUERY } from '@/config/breakpoints';
import styles from './header.module.scss';
import BrandLogo from '@/components/BrandLogo';
import { GAME_BRAND } from '@/config/brand';
import { GAME_PUBLIC_CLIENT } from '@/config/gameFlag';

export default function Header() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: session, status: sessionStatus } = useSession();
  const sessionLoading = sessionStatus === 'loading';
  const { credits, authenticated: hasCredits } = useCredits();
  const { t } = useTranslation('nav');
  const { locale, setLocale } = useI18n();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const menuRef = useRef<HTMLDivElement>(null);
  const hamburgerRef = useRef<HTMLButtonElement>(null);

  // Rota veya query değişince (alt nav sekmeleri aynı sayfada query değiştirir) menü kapansın
  const [menuPath, setMenuPath] = useState(router.asPath);
  if (menuPath !== router.asPath) {
    setMenuPath(router.asPath);
    setMobileMenuOpen(false);
  }

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

  useEffect(() => {
    writeAuthHint(sessionStatus, window.localStorage, document.documentElement);
  }, [sessionStatus]);

  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: AUTH_HINT_SCRIPT }} />
      <header className={styles.header}>
        <Container className={styles.headerContainer}>
          <div className={styles.left}>
            <div className={styles.logo}>
              <Link href="/" className={styles.logoLink} onMouseEnter={prefetchHome} onFocus={prefetchHome}>
                {/* Header her iki temada da koyu zeminli → koyu-zemin varyantı. */}
                <BrandLogo surface="dark" height={34} priority />
              </Link>
            </div>
          </div>
          <div className={styles.mid}>
            <nav className={`${styles.mainNav} ${searchOpen ? styles.mainNavHidden : ''}`.trim()} aria-label={t('mainNav')}>
              <Link
                href="/"
                className={`${styles.navLink} ${router.pathname === '/' ? styles.navLinkActive : ''}`.trim()}
                aria-current={router.pathname === '/' ? 'page' : undefined}
                onMouseEnter={prefetchHome}
                onFocus={prefetchHome}
              >
                {t('matches')}
              </Link>
              <Link
                href="/gundem"
                className={`${styles.navLink} ${router.pathname.startsWith('/gundem') ? styles.navLinkActive : ''}`.trim()}
                aria-current={router.pathname.startsWith('/gundem') ? 'page' : undefined}
              >
                {t('gundem')}
              </Link>
              {GAME_PUBLIC_CLIENT ? (
                <Link
                  href={GAME_BRAND.basePath}
                  className={`${styles.navLink} ${router.asPath.startsWith(GAME_BRAND.basePath) ? styles.navLinkActive : ''}`.trim()}
                >
                  {t('game')}
                </Link>
              ) : null}
              <AiMenu />
            </nav>
            <HeaderSearch expandable onExpandedChange={setSearchOpen} />
          </div>
          <div className={styles.actions}>
            {/* Yer oturum bilgisi gelmeden ayrılı (ziyaretçi / ipucuyla oturum açık genişliği, bkz. utils/authHint.ts). */}
            <div className={styles.authSlot}>
              {sessionLoading ? (
                // Oturum durumu netleşene kadar "Giriş Yap/Üye Ol" ya da "Profil" gibi
                // yanlış olabilecek bir state göstermek yerine nötr bir placeholder gösteriyoruz.
                // Bu, sayfa her yüklendiğinde header'ın "titremesini" (auth flicker) önler.
                <div className={styles.authPlaceholder} aria-hidden="true" />
              ) : session ? (
                <>
                  {hasCredits ? (
                    <Link href="/pricing" className={styles.creditChip} title={t('credits')}>
                      {`${credits} ⚡`}
                    </Link>
                  ) : null}
                  <NotificationBell />
                  <AccountMenu />
                </>
              ) : (
                <>
                  <Link href="/auth/signin" className={styles.signInLink}>
                    {t('signIn')}
                  </Link>
                  <Link href="/auth/signup?src=header" className={styles.signUpBtn}>
                    {t('signUp')}
                    <span className={styles.signUpBadge} title={t('signUpBadgeLabel')}>
                      {t('signUpBadge')}
                    </span>
                  </Link>
                </>
              )}
            </div>
            <ThemeToggle className={styles.iconBtn} />
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
          <div ref={menuRef} className={styles.mobileMenu}>
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
              <Link href="/frikik?src=menu" className={styles.mobileNavLink} onClick={() => trackFrikik('frikik_card_click', { entry: 'menu' })}>
                {t('frikik')}
              </Link>
              {GAME_PUBLIC_CLIENT ? (
                <Link href={GAME_BRAND.basePath} className={styles.mobileNavLink}>
                  {t('game')}
                </Link>
              ) : null}
              {session && <MyAnalysesDropdown />}
              <Link href="/pricing" className={styles.mobileNavLink}>
                {t('pricing')}
              </Link>
              {/* Bakiye yalnız oturumda; ziyaretçide "Fiyatlandırma" aynı sayfaya gider (çift bağlantı olmasın). */}
              {hasCredits ? (
                <Link href="/pricing" className={styles.mobileNavLinkPremium}>
                  {`${credits} ⚡ ${t('credits')}`}
                </Link>
              ) : null}
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
    </>
  );
}
