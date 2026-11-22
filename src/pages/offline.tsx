import Head from 'next/head';
import Link from 'next/link';
import Container from '@/components/Container';

/** Çevrimdışı yedek sayfa (büyüme raporu 3.2): service worker ağ yokken gezinmede bunu gösterir (public/sw.js). */
export default function OfflinePage() {
  return (
    <Container>
      <Head>
        <title>Bağlantı yok · Scor3</title>
        <meta name="robots" content="noindex" />
      </Head>
      <div style={{ padding: '48px 0', textAlign: 'center' }}>
        <h1>İnternet bağlantısı yok</h1>
        <p>Canlı skorlar için bağlantı gerekiyor. Bağlantın gelince sayfayı yenile.</p>
        <p>
          <Link href="/">Ana sayfaya dön</Link>
        </p>
      </div>
    </Container>
  );
}
