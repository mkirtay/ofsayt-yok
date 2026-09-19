import { ReactNode } from 'react';
import Header from '../Header';
import Footer from '../Footer';
import Container from '../Container';
import SponsorSlider from '../SponsorSlider';
import BottomNav from '../BottomNav';
import styles from './layout.module.scss';

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  return (
    <>
      <Header />
      <main className={styles.main}>{children}</main>
      <Container>
        <SponsorSlider />
      </Container>
      <Footer />
      <BottomNav />
    </>
  );
}
