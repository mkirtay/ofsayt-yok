import { ReactNode } from 'react';
import { useRouter } from 'next/router';
import Header from '../Header';
import Footer from '../Footer';
import Container from '../Container';
import SponsorSlider from '../SponsorSlider';
import BottomNav from '../BottomNav';
import KuralKosesiMount from '../KuralKosesi/Mount';
import { usesStaticPageLayout } from './staticPageLayout';
import styles from './layout.module.scss';

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const isStatic = usesStaticPageLayout(useRouter().pathname);
  return (
    <>
      <div className={isStatic ? styles.shell : undefined}>
        <Header />
        <main className={isStatic ? styles.main : `${styles.main} ${styles.mainFill}`}>{children}</main>
        <Container className={styles.sponsor}>
          <SponsorSlider />
        </Container>
        <Footer />
      </div>
      <BottomNav />
      <KuralKosesiMount />
    </>
  );
}
