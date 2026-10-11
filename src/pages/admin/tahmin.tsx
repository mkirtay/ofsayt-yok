import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import { getServerSession } from 'next-auth/next';
import AdminGame from '@/components/Game/AdminGame';
import { authOptions } from '@/lib/auth-options';
import { gameMode } from '@/config/gameFlag';

/**
 * Yalnızca ADMIN: oturum yok/ADMIN değil → 404. Asıl koruma burada ve API uçlarındaki `requireAdmin`;
 * `src/middleware.ts`'teki `/admin/*` kontrolü ek bir katman.
 */
export const getServerSideProps: GetServerSideProps = async ({ req, res }) => {
  if (gameMode() === 'off') return { notFound: true }; // GAME_ENABLED kapalı → yönetim de yok
  const session = await getServerSession(req, res, authOptions);
  if (session?.user?.role !== 'ADMIN') return { notFound: true };
  return { props: {} };
};

export default function AdminGamePage() {
  return (
    <>
      <Head>
        <title>Tahmin oyunu yönetimi</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <AdminGame />
    </>
  );
}
