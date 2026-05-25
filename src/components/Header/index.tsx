import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useSession, signOut } from 'next-auth/react';
import { useState, useEffect } from 'react';
import { useTranslation, useI18n } from '@/lib/i18n';
import Container from '../Container';
import HeaderButton from '../HeaderButton';
import styles from './header.module.scss';

export default function Header() {
  const router = useRouter();
  const { data: session } = useSession();
  const { t } = useTranslation('nav');
  const { locale, setLocale } = useI18n();
  const isWorldCupRoute = router.pathname.startsWith('/world-cup');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [router.pathname]);

  function toggleLang() {
    setLocale(locale === 'tr' ? 'en' : 'tr');
  }

  return (
    <header className={`${styles.header} ${isWorldCupRoute ? styles.headerWorldCup : ''}`.trim()}>
      <Container className={styles.headerContainer}>
        <div className={styles.left}>
          <div className={styles.logo}>
            <Link href="/" className={styles.logoLink}>
              <Image
                src={isWorldCupRoute ? '/images/logo-black.svg' : '/images/logo.svg'}
                alt="Ofsayt Yok"
                width={146}
                height={28}
                priority
              />
            </Link>
          </div>
          <div className={styles.headerNavPills}>
            {isWorldCupRoute ? (
              <Link href="/world-cup" className={styles.worldCupMarkLink} aria-label="FIFA World Cup">
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
              <Link href="/world-cup" className={styles.headerNavPill}>
                {t('worldCup')}
              </Link>
            )}
            <Link href="/uefa" className={styles.headerNavPill}>
              {t('uefa')}
            </Link>
            <Link href="/ai-istatistikleri" className={styles.headerNavPill}>
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
              <Link href="/profile" className={styles.profileLink}>
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
        <div className={`${styles.mobileMenu} ${isWorldCupRoute ? styles.mobileMenuWorldCup : ''}`}>
          <nav className={styles.mobileNav}>
            {!isWorldCupRoute && (
              <Link href="/world-cup" className={styles.mobileNavLink}>
                {t('worldCup')}
              </Link>
            )}
            <Link href="/uefa" className={styles.mobileNavLink}>
              {t('uefa')}
            </Link>
            <Link href="/ai-istatistikleri" className={styles.mobileNavLink}>
              {t('aiAccuracy')}
            </Link>
            <Link href="/premium" className={styles.mobileNavLinkPremium}>
              {t('premium')}
            </Link>
          </nav>
          <div className={styles.mobileActions}>
            {session ? (
              <>
                <Link href="/profile" className={styles.mobileNavLink}>
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
