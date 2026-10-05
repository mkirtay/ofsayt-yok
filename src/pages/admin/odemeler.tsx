import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import { getServerSession } from 'next-auth/next';
import AdminPayments from '@/components/AdminPayments';
import { authOptions } from '@/lib/auth-options';

/** Yalnızca ADMIN: oturum yok / ADMIN değil → 404 (middleware ek katman; API requireAdmin). */
export const getServerSideProps: GetServerSideProps = async ({ req, res }) => {
  const session = await getServerSession(req, res, authOptions);
  if (session?.user?.role !== 'ADMIN') return { notFound: true };
  return { props: {} };
};

export default function AdminPaymentsPage() {
  return (
    <>
      <Head>
        <title>Ödemeler — yönetici</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <AdminPayments />
    </>
  );
}
