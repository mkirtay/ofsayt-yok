import { ReactNode } from 'react';
import Header from '../Header';

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  return (
    <>
      <Header />
      <main style={{ minHeight: 'calc(100vh - 60px)', paddingBottom: '32px' }}>
        {children}
      </main>
    </>
  );
}
