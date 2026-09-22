import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import { getServerSession } from 'next-auth/next';
import AdminBotQueue from '@/components/AdminBotQueue';
import { authOptions } from '@/lib/auth-options';

/**
 * Yalnızca ADMIN: oturum yok/ADMIN değil → 404. Asıl koruma burada ve API uçlarındaki `requireAdmin`;
 * `src/middleware.ts`'teki `/admin/*` kontrolü ek bir katman.
 */
export const getServerSideProps: GetServerSideProps = async ({ req, res }) => {
  const session = await getServerSession(req, res, authOptions);
  if (session?.user?.role !== 'ADMIN') return { notFound: true };
  return { props: {} };
};

export default function GundemQueuePage() {
  return (
    <>
      <Head>
        <title>Gündem onay kuyruğu</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <AdminBotQueue />
    </>
  );
}
