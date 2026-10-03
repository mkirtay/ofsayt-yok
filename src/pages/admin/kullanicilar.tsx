import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import { getServerSession } from 'next-auth/next';
import AdminUsers from '@/components/AdminUsers';
import { authOptions } from '@/lib/auth-options';

/** Yalnızca ADMIN: oturum yok / ADMIN değil → 404 (middleware ek katman; API'ler requireAdmin). */
export const getServerSideProps: GetServerSideProps = async ({ req, res }) => {
  const session = await getServerSession(req, res, authOptions);
  if (session?.user?.role !== 'ADMIN') return { notFound: true };
  return { props: {} };
};

export default function AdminUsersPage() {
  return (
    <>
      <Head>
        <title>Kullanıcılar — yönetici</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <AdminUsers />
    </>
  );
}
