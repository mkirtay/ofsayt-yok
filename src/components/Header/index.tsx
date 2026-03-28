import Link from 'next/link';
import Container from '../Container';
import styles from './header.module.scss';

export default function Header() {
  return (
    <header className={styles.header}>
      <Container className={styles.headerContainer}>
        <div className={styles.logo}>
          <Link href="/">
            Ofsayt Yok
          </Link>
        </div>
        <nav className={styles.nav}>
          <Link href="/" className={styles.navLink}>Canlı Skorlar</Link>
          <Link href="/standings" className={styles.navLink}>Puan Durumu</Link>
        </nav>
      </Container>
    </header>
  );
}
