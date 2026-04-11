import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/router';
import Container from '../Container';
import HeaderButton from '../HeaderButton';
import styles from './header.module.scss';

export default function Header() {
  const router = useRouter();
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
          <HeaderButton variant="outline">Giriş Yap</HeaderButton>
          <HeaderButton variant="filled">Üye Ol</HeaderButton>
        </div>
      </Container>
    </header>
  );
}
