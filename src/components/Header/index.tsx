import Image from 'next/image';
import Link from 'next/link';
import Container from '../Container';
import HeaderButton from '../HeaderButton';
import styles from './header.module.scss';

export default function Header() {
  return (
    <header className={styles.header}>
      <Container className={styles.headerContainer}>
        <div className={styles.logo}>
          <Link href="/" className={styles.logoLink}>
            <Image
              src="/images/logo.svg"
              alt="Ofsayt Yok"
              width={146}
              height={28}
              priority
            />
          </Link>
        </div>
        <div className={styles.actions}>
          <HeaderButton variant="outline">Giriş Yap</HeaderButton>
          <HeaderButton variant="filled">Üye Ol</HeaderButton>
        </div>
      </Container>
    </header>
  );
}
