import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import AdminGame from '@/components/Game/AdminGame';
import AdminNav from '@/components/AdminNav';
import { adminPageGuard } from '@/lib/adminPageGuard';
import { gameMode } from '@/config/gameFlag';

/**
 * Yalnızca ADMIN: geçerli oturum yok → giriş, ADMIN değil → 404 (lib/adminPageGuard.ts; API'ler requireAdmin). GAME_ENABLED
 * kapalıyken sayfa da yok (404).
 */
export const getServerSideProps: GetServerSideProps = async (ctx) => {
  if (gameMode() === 'off') return { notFound: true }; // GAME_ENABLED kapalı → yönetim de yok
  return adminPageGuard(ctx);
};

export default function AdminGamePage() {
  return (
    <>
      <Head>
        <title>Tahmin oyunu yönetimi</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <AdminNav />
      <AdminGame />
    </>
  );
}
