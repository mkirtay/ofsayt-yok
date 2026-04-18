import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useSession, signOut } from 'next-auth/react';
import Container from '../Container';
import HeaderButton from '../HeaderButton';
import styles from './header.module.scss';

export default function Header() {
  const router = useRouter();
  const { data: session } = useSession();
  const isWorldCupRoute = router.pathname.startsWith('/world-cup');

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
            <Link href="/world-cup" className={styles.worldCupLink}>
              WORLD CUP
            </Link>
          )}
        </div>
        <div className={styles.actions}>
          {session ? (
            <>
              <Link href="/profile" className={styles.profileLink}>
                Profil
              </Link>
              <span className={styles.userName}>
                {session.user.username || session.user.name || session.user.email}
              </span>
              <HeaderButton variant="outline" onClick={() => signOut()}>
                Çıkış Yap
              </HeaderButton>
            </>
          ) : (
            <>
              <HeaderButton variant="outline" onClick={() => router.push('/auth/signin')}>
                Giriş Yap
              </HeaderButton>
              <HeaderButton variant="filled" onClick={() => router.push('/auth/signup')}>
                Üye Ol
              </HeaderButton>
            </>
          )}
        </div>
      </Container>
    </header>
  );
}
